wipe
model BasicBuilder -ndm 2 -ndf 3
node 1 0 0
node 2 6 0
node 3 0 3.5
node 4 6 3.5
mass 3 2196 2196 0
mass 4 2196 2196 0
uniaxialMaterial Steel01 1 400000000 200000000000 0.01
uniaxialMaterial Concrete01 2 -30000000 -0.002 -6000000 -0.006
section Fiber 1 {
    patch rect 2 8 8 -0.2 -0.2 0.2 0.2
    fiber -0.15 -0.15 0.00031415926535897936 1
    fiber -0.15 0 0.00031415926535897936 1
    fiber -0.15 0.15 0.00031415926535897936 1
    fiber 0 -0.15 0.00031415926535897936 1
    fiber 0 0.15 0.00031415926535897936 1
    fiber 0.15 -0.15 0.00031415926535897936 1
    fiber 0.15 0 0.00031415926535897936 1
    fiber 0.15 0.15 0.00031415926535897936 1
}
geomTransf Linear 1
beamIntegration Legendre 1 1 4
element dispBeamColumn 1 1 3 1 1
element dispBeamColumn 2 2 4 1 1
element dispBeamColumn 3 3 4 1 1
fix 1 1 1 0
fix 2 1 1 0
timeSeries Linear 1 -factor 1
recorder Node -file out/disp.out -time -node 1 2 3 4 -dof 1 2 3 disp
recorder Node -file out/reaction.out -time -node 1 2 3 4 -dof 1 2 3 reaction
recorder Element -file out/eleLocalForce.out -time -ele 1 2 3 localForce
constraints Plain
numberer RCM
system BandGeneral
eigen 2
# Dead Load
pattern Plain 1 1 -fact 1 {
    eleLoad -ele 3 -type -beamUniform -7182.045 0
}
# Live Load
pattern Plain 2 1 -fact 1 {
    eleLoad -ele 3 -type -beamUniform -11491.272 0
}
constraints Plain
numberer RCM
system BandGeneral
test NormDispIncr 0.000001 25
algorithm Newton
integrator LoadControl 0.1
analysis Static
analyze 10
loadConst -time 0
# Push
pattern Plain 3 1 -fact 1 {
    load 3 1000 0 0
    load 4 1000 0 0
}
constraints Plain
numberer RCM
system BandGeneral
test NormDispIncr 0.000001 25
algorithm Newton
integrator DisplacementControl 4 1 0.00105
analysis Static
analyze 100
