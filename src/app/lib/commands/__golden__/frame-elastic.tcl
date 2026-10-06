wipe
model BasicBuilder -ndm 2 -ndf 3
node 1 0 0
node 2 6 0
node 3 12 0
node 4 0 3.5
node 5 6 3.5
node 6 12 3.5
node 7 0 7
node 8 6 7
node 9 12 7
mass 4 2196 2196 0
mass 5 4393 4393 0
mass 6 2196 2196 0
mass 7 2196 2196 0
mass 8 4393 4393 0
mass 9 2196 2196 0
uniaxialMaterial Elastic 1 200000000000
geomTransf Linear 1
element elasticBeamColumn 1 1 4 0.01 200000000000 0.0001 1
element elasticBeamColumn 2 4 7 0.01 200000000000 0.0001 1
element elasticBeamColumn 3 2 5 0.01 200000000000 0.0001 1
element elasticBeamColumn 4 5 8 0.01 200000000000 0.0001 1
element elasticBeamColumn 5 3 6 0.01 200000000000 0.0001 1
element elasticBeamColumn 6 6 9 0.01 200000000000 0.0001 1
element elasticBeamColumn 7 4 5 0.01 200000000000 0.0001 1
element elasticBeamColumn 8 5 6 0.01 200000000000 0.0001 1
element elasticBeamColumn 9 7 8 0.01 200000000000 0.0001 1
element elasticBeamColumn 10 8 9 0.01 200000000000 0.0001 1
fix 1 1 1 1
fix 2 1 1 1
fix 3 1 1 1
timeSeries Linear 1 -factor 1
recorder Node -file out/disp.out -time -node 1 2 3 4 5 6 7 8 9 -dof 1 2 3 disp
recorder Node -file out/reaction.out -time -node 1 2 3 4 5 6 7 8 9 -dof 1 2 3 reaction
recorder Element -file out/eleLocalForce.out -time -ele 1 2 3 4 5 6 7 8 9 10 localForce
constraints Plain
numberer RCM
system BandGeneral
eigen 3
# Dead Load
pattern Plain 1 1 -fact 1 {
    eleLoad -ele 7 8 9 10 -type -beamUniform -7182.045 0
}
# Live Load
pattern Plain 2 1 -fact 1 {
    eleLoad -ele 7 8 9 10 -type -beamUniform -11491.272 0
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
    load 4 1000 0 0
    load 5 1000 0 0
    load 6 1000 0 0
    load 7 2000 0 0
    load 8 2000 0 0
    load 9 2000 0 0
}
constraints Plain
numberer RCM
system BandGeneral
test NormDispIncr 0.000001 25
algorithm Newton
integrator DisplacementControl 9 1 0.0007000000000000001
analysis Static
analyze 100
