wipe
model BasicBuilder -ndm 3 -ndf 6
node 1 0 0 0
node 2 5 0 0
node 3 10 0 0
node 4 0 4 0
node 5 5 4 0
node 6 10 4 0
node 7 0 0 3
node 8 5 0 3
node 9 10 0 3
node 10 0 4 3
node 11 5 4 3
node 12 10 4 3
node 13 0 0 6
node 14 5 0 6
node 15 10 0 6
node 16 0 4 6
node 17 5 4 6
node 18 10 4 6
mass 7 9174 9174 9174 0 0 0
mass 8 14271 14271 14271 0 0 0
mass 9 9174 9174 9174 0 0 0
mass 10 9174 9174 9174 0 0 0
mass 11 14271 14271 14271 0 0 0
mass 12 9174 9174 9174 0 0 0
mass 13 9174 9174 9174 0 0 0
mass 14 14271 14271 14271 0 0 0
mass 15 9174 9174 9174 0 0 0
mass 16 9174 9174 9174 0 0 0
mass 17 14271 14271 14271 0 0 0
mass 18 9174 9174 9174 0 0 0
geomTransf Linear 1 1 0 0
geomTransf Linear 2 0 0 1
element elasticBeamColumn 1 1 7 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 2 7 13 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 3 2 8 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 4 8 14 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 5 3 9 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 6 9 15 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 7 4 10 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 8 10 16 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 9 5 11 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 10 11 17 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 11 6 12 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 12 12 18 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 1
element elasticBeamColumn 13 7 8 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 14 8 9 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 15 10 11 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 16 11 12 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 17 13 14 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 18 14 15 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 19 16 17 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 20 17 18 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 21 7 10 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 22 8 11 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 23 9 12 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 24 13 16 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 25 14 17 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
element elasticBeamColumn 26 15 18 0.16 30000000000 12500000000 0.0036 0.00213 0.00213 2
fix 1 1 1 1 1 1 1
fix 2 1 1 1 1 1 1
fix 3 1 1 1 1 1 1
fix 4 1 1 1 1 1 1
fix 5 1 1 1 1 1 1
fix 6 1 1 1 1 1 1
timeSeries Linear 1 -factor 1
recorder Node -file out/disp.out -time -node 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 -dof 1 2 3 4 5 6 disp
recorder Node -file out/reaction.out -time -node 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 -dof 1 2 3 4 5 6 reaction
recorder Element -file out/eleLocalForce.out -time -ele 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 localForce
constraints Plain
numberer RCM
system BandGeneral
eigen 3
# Dead Load
pattern Plain 1 1 -fact 1 {
    eleLoad -ele 13 14 15 16 17 18 19 20 21 22 23 24 25 26 -type -beamUniform 0 -20000 0
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
pattern Plain 2 1 -fact 1 {
    load 7 1000 0 0 0 0 0
    load 8 1000 0 0 0 0 0
    load 9 1000 0 0 0 0 0
    load 10 1000 0 0 0 0 0
    load 11 1000 0 0 0 0 0
    load 12 1000 0 0 0 0 0
    load 13 2000 0 0 0 0 0
    load 14 2000 0 0 0 0 0
    load 15 2000 0 0 0 0 0
    load 16 2000 0 0 0 0 0
    load 17 2000 0 0 0 0 0
    load 18 2000 0 0 0 0 0
}
constraints Plain
numberer RCM
system BandGeneral
test NormDispIncr 0.000001 25
algorithm Newton
integrator DisplacementControl 15 1 0.0006
analysis Static
analyze 100
