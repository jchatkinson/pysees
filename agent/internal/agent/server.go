package agent

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var DefaultPorts = []int{8765, 8766, 8767, 8768}

const ScriptTemplate = `import json
import sys
import openseespy.opensees as ops

material_args = __MATERIAL_ARGS__
strain_targets = __STRAIN_TARGETS__

ops.wipe()
ops.model('basic', '-ndm', 1, '-ndf', 1)
ops.uniaxialMaterial(*material_args)
ops.node(1, 0.0)
ops.node(2, 0.0)
ops.fix(1, 1)
ops.element('zeroLength', 1, 1, 2, '-mat', 1, '-dir', 1)
ops.timeSeries('Linear', 100)
ops.pattern('Plain', 100, 100)
ops.load(2, 1.0)
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('FullGeneral')
ops.test('NormUnbalance', 1e-6, 25, 0)
ops.algorithm('NewtonLineSearch', '-type', 'Bisection')
ops.integrator('LoadControl', 1.0)
ops.analysis('Static')

def read_stress():
    ops.reactions()
    return -float(ops.nodeReaction(1, 1))

u_now = float(ops.nodeDisp(2, 1))
for i, target in enumerate(strain_targets):
    step = float(target - u_now)
    if abs(step) > 0:
        ops.integrator('DisplacementControl', 2, 1, step)
        ok = ops.analyze(1)
        if ok != 0:
            print(json.dumps({'event': 'error', 'i': i, 'message': f'analysis failed at index {i}'}), flush=True)
            break
        u_now = float(ops.nodeDisp(2, 1))
    print(json.dumps({'event': 'point', 'i': i, 'eps': u_now, 'sig': read_stress()}), flush=True)
`

type Config struct {
	PythonBin       string
	JobTimeout      time.Duration
	WorkDir         string
	OriginAllowlist []string
}

type Server struct {
	cfg      Config
	upgrader websocket.Upgrader
	tokensMu sync.Mutex
	tokens   map[string]time.Time
}

type MaterialCall struct {
	Fn   string        `json:"fn"`
	Args []interface{} `json:"args"`
}

type RunMaterialMsg struct {
	Type         string       `json:"type"`
	JobID        string       `json:"jobId"`
	MaterialCall MaterialCall `json:"materialCall"`
	Protocol     struct {
		Strain []float64 `json:"strain"`
	} `json:"protocol"`
	Ndm int `json:"ndm"`
	Ndf int `json:"ndf"`
}

type CancelMsg struct {
	Type  string `json:"type"`
	JobID string `json:"jobId"`
}

func New(cfg Config) *Server {
	if cfg.PythonBin == "" {
		cfg.PythonBin = "python"
	}
	if cfg.JobTimeout <= 0 {
		cfg.JobTimeout = 30 * time.Second
	}
	if cfg.WorkDir == "" {
		cfg.WorkDir = os.TempDir()
	}
	if len(cfg.OriginAllowlist) == 0 {
		cfg.OriginAllowlist = []string{"https://pysees.app", "http://localhost:5173"}
	}
	s := &Server{cfg: cfg, tokens: map[string]time.Time{}}
	s.upgrader = websocket.Upgrader{CheckOrigin: s.allowOrigin}
	return s
}

func ListenFallback() (net.Listener, int, error) {
	var errs []string
	for _, p := range DefaultPorts {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			return ln, p, nil
		}
		errs = append(errs, fmt.Sprintf("%d:%v", p, err))
	}
	return nil, 0, fmt.Errorf("failed to bind fallback ports: %s", strings.Join(errs, " | "))
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/v1/session", s.session)
	mux.HandleFunc("/v1/ws", s.ws)
	return s.withCORS(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"name": "pysees-agent", "version": "0.1.0"})
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	if !s.allowOrigin(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin_not_allowed"})
		return
	}
	token := randomToken(24)
	expires := time.Now().Add(10 * time.Minute)
	s.tokensMu.Lock()
	s.tokens[token] = expires
	s.tokensMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]string{"sessionToken": token, "expiresAt": expires.UTC().Format(time.RFC3339)})
}

func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	if !s.consumeToken(r.URL.Query().Get("token")) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_token"})
		return
	}
	c, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer c.Close()

	var writeMu sync.Mutex
	send := func(v interface{}) {
		writeMu.Lock()
		defer writeMu.Unlock()
		if err := c.WriteJSON(v); err != nil {
			log.Printf("ws write error: %v", err)
		}
	}

	var currentCancel context.CancelFunc
	var currentJob string
	var runMu sync.Mutex

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			if currentCancel != nil {
				currentCancel()
			}
			return
		}

		var envelope struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			send(map[string]interface{}{"type": "job_error", "jobId": "", "code": "BAD_REQUEST", "message": "invalid json"})
			continue
		}

		switch envelope.Type {
		case "run_material":
			var msg RunMaterialMsg
			if err := json.Unmarshal(data, &msg); err != nil {
				send(map[string]interface{}{"type": "job_error", "jobId": "", "code": "BAD_REQUEST", "message": "invalid run payload"})
				continue
			}
			if err := validateRunMessage(msg); err != nil {
				send(map[string]interface{}{"type": "job_error", "jobId": msg.JobID, "code": "BAD_REQUEST", "message": err.Error()})
				continue
			}
			runMu.Lock()
			if currentCancel != nil {
				currentCancel()
			}
			ctx, cancel := context.WithTimeout(context.Background(), s.cfg.JobTimeout)
			currentCancel = cancel
			currentJob = msg.JobID
			runMu.Unlock()
			send(map[string]interface{}{"type": "job_started", "jobId": msg.JobID})

			go func(m RunMaterialMsg) {
				start := time.Now()
				err := s.runMaterialJob(ctx, m, send)
				if err != nil {
					code := "EXEC_FAILED"
					if errors.Is(err, context.DeadlineExceeded) {
						code = "EXEC_TIMEOUT"
					} else if errors.Is(err, context.Canceled) {
						code = "CANCELLED"
					}
					send(map[string]interface{}{"type": "job_error", "jobId": m.JobID, "code": code, "message": err.Error()})
					return
				}
				send(map[string]interface{}{"type": "job_finished", "jobId": m.JobID, "pointCount": len(m.Protocol.Strain), "elapsedMs": time.Since(start).Milliseconds()})
			}(msg)

		case "cancel_job":
			var msg CancelMsg
			_ = json.Unmarshal(data, &msg)
			runMu.Lock()
			if currentCancel != nil && (msg.JobID == "" || msg.JobID == currentJob) {
				currentCancel()
			}
			runMu.Unlock()
		default:
			send(map[string]interface{}{"type": "job_error", "jobId": "", "code": "BAD_REQUEST", "message": "unknown message type"})
		}
	}
}

func (s *Server) runMaterialJob(ctx context.Context, msg RunMaterialMsg, send func(interface{})) error {
	materialJSON, _ := json.Marshal(msg.MaterialCall.Args)
	strainJSON, _ := json.Marshal(msg.Protocol.Strain)
	script := strings.ReplaceAll(ScriptTemplate, "__MATERIAL_ARGS__", string(materialJSON))
	script = strings.ReplaceAll(script, "__STRAIN_TARGETS__", string(strainJSON))

	tmpDir, err := os.MkdirTemp(s.cfg.WorkDir, "pysees-agent-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	scriptPath := filepath.Join(tmpDir, "material_probe.py")
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, s.cfg.PythonBin, scriptPath)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("python start failed: %w", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go scanStdout(&wg, stdout, msg.JobID, send)
	go scanStderr(&wg, stderr, msg.JobID, send)
	waitErr := cmd.Wait()
	wg.Wait()
	if waitErr != nil {
		return waitErr
	}
	return ctx.Err()
}

func scanStdout(wg *sync.WaitGroup, r io.Reader, jobID string, send func(interface{})) {
	defer wg.Done()
	s := bufio.NewScanner(r)
	for s.Scan() {
		line := s.Text()
		var event struct {
			Event   string  `json:"event"`
			I       int     `json:"i"`
			Eps     float64 `json:"eps"`
			Sig     float64 `json:"sig"`
			Message string  `json:"message"`
		}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			send(map[string]interface{}{"type": "job_log", "jobId": jobID, "stream": "stdout", "line": line})
			continue
		}
		if event.Event == "point" {
			send(map[string]interface{}{"type": "point", "jobId": jobID, "i": event.I, "eps": event.Eps, "sig": event.Sig})
			continue
		}
		if event.Event == "error" {
			send(map[string]interface{}{"type": "job_error", "jobId": jobID, "code": "EXEC_FAILED", "message": event.Message})
		}
	}
}

func scanStderr(wg *sync.WaitGroup, r io.Reader, jobID string, send func(interface{})) {
	defer wg.Done()
	s := bufio.NewScanner(r)
	for s.Scan() {
		send(map[string]interface{}{"type": "job_log", "jobId": jobID, "stream": "stderr", "line": s.Text()})
	}
}

func validateRunMessage(msg RunMaterialMsg) error {
	if strings.TrimSpace(msg.JobID) == "" {
		return errors.New("jobId is required")
	}
	if msg.MaterialCall.Fn != "uniaxialMaterial" {
		return errors.New("materialCall.fn must be uniaxialMaterial")
	}
	if len(msg.MaterialCall.Args) < 2 {
		return errors.New("materialCall.args must include type and matTag")
	}
	name, ok := msg.MaterialCall.Args[0].(string)
	if !ok || strings.TrimSpace(name) == "" {
		return errors.New("material type must be a non-empty string")
	}
	if len(msg.MaterialCall.Args) > 128 {
		return errors.New("materialCall.args too long")
	}
	for i, v := range msg.MaterialCall.Args[1:] {
		switch x := v.(type) {
		case float64:
			if math.IsNaN(x) || math.IsInf(x, 0) {
				return fmt.Errorf("arg %d must be finite", i+1)
			}
		case string, bool, nil:
		default:
			return fmt.Errorf("arg %d type is not allowed", i+1)
		}
	}
	if len(msg.Protocol.Strain) == 0 {
		return errors.New("protocol.strain is required")
	}
	for i, x := range msg.Protocol.Strain {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return fmt.Errorf("protocol.strain[%d] must be finite", i)
		}
	}
	return nil
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && s.allowOrigin(r) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) allowOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}
	for _, allowed := range s.cfg.OriginAllowlist {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (s *Server) consumeToken(token string) bool {
	if token == "" {
		return false
	}
	s.tokensMu.Lock()
	defer s.tokensMu.Unlock()
	exp, ok := s.tokens[token]
	if !ok {
		return false
	}
	delete(s.tokens, token)
	return time.Now().Before(exp)
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
