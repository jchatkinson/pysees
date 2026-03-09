package agent

import "testing"

func baseRunMessage() RunMaterialMsg {
	msg := RunMaterialMsg{Type: "run_material", JobID: "job-1", MaterialCall: MaterialCall{Fn: "uniaxialMaterial", Args: []interface{}{"Steel01", float64(1), float64(350), float64(200000), float64(0.01)}}}
	msg.Protocol.Strain = []float64{0, 0.001, -0.001}
	return msg
}

func TestValidateRunMessageOK(t *testing.T) {
	if err := validateRunMessage(baseRunMessage()); err != nil {
		t.Fatalf("expected valid message: %v", err)
	}
}

func TestValidateRunMessageRejectsBadFn(t *testing.T) {
	msg := baseRunMessage()
	msg.MaterialCall.Fn = "node"
	if err := validateRunMessage(msg); err == nil {
		t.Fatal("expected invalid fn error")
	}
}

func TestValidateRunMessageRejectsMissingMaterialType(t *testing.T) {
	msg := baseRunMessage()
	msg.MaterialCall.Args[0] = ""
	if err := validateRunMessage(msg); err == nil {
		t.Fatal("expected invalid material type error")
	}
}
