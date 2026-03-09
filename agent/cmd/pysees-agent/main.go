package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"pysees/agent/internal/agent"
)

func main() {
	pythonBin := flag.String("python-bin", "python", "Path to python executable")
	workDir := flag.String("work-dir", os.TempDir(), "Directory for temporary scripts")
	origins := flag.String("origin-allowlist", "https://pysees.app,http://localhost:5173", "Comma-separated allowed Origins")
	timeout := flag.Duration("job-timeout", 30*time.Second, "Per-job timeout")
	flag.Parse()

	srv := agent.New(agent.Config{
		PythonBin:       *pythonBin,
		JobTimeout:      *timeout,
		WorkDir:         *workDir,
		OriginAllowlist: splitCSV(*origins),
	})

	ln, port, err := agent.ListenFallback()
	if err != nil {
		log.Fatalf("bind failed: %v", err)
	}
	defer ln.Close()

	log.Printf("pysees-agent listening on http://127.0.0.1:%d", port)
	if err := http.Serve(ln, srv.Handler()); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		q := strings.TrimSpace(p)
		if q != "" {
			out = append(out, q)
		}
	}
	if len(out) == 0 {
		fmt.Println("warning: empty origin allowlist")
	}
	return out
}
