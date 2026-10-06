wipe
model BasicBuilder -ndm 2 -ndf 3
node 1 0 0
node 2 0 0.75
node 3 0 1.5
node 4 0 2.25
node 5 0 3
mass 2 250 250 0
mass 3 250 250 0
mass 4 250 250 0
mass 5 125 125 0
uniaxialMaterial Elastic 1 200000000000
geomTransf Linear 1
element elasticBeamColumn 1 1 2 0.01 200000000000 0.0001 1
element elasticBeamColumn 2 2 3 0.01 200000000000 0.0001 1
element elasticBeamColumn 3 3 4 0.01 200000000000 0.0001 1
element elasticBeamColumn 4 4 5 0.01 200000000000 0.0001 1
fix 1 1 1 1
timeSeries Linear 1 -factor 1
recorder Node -file out/disp.out -time -node 1 2 3 4 5 -dof 1 2 3 disp
recorder Node -file out/reaction.out -time -node 1 2 3 4 5 -dof 1 2 3 reaction
recorder Element -file out/eleLocalForce.out -time -ele 1 2 3 4 localForce
constraints Plain
numberer RCM
system BandGeneral
eigen 3
pattern Plain 1 1 -fact 1 {
    load 5 10000 0 0
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
