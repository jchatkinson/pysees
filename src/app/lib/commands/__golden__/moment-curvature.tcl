wipe
model BasicBuilder -ndm 2 -ndf 3
node 1 0 0
node 2 0 0
uniaxialMaterial Steel01 1 400000000 200000000000 0.01
uniaxialMaterial Concrete01 2 -30000000 -0.002 -6000000 -0.006
section Fiber 1 {
    patch rect 2 8 8 -0.25 -0.15 0.25 0.15
    fiber -0.21 -0.11 0.00031415926535897936 1
    fiber -0.21 0.11 0.00031415926535897936 1
    fiber 0.21 -0.11 0.00031415926535897936 1
    fiber 0.21 0.11 0.00031415926535897936 1
}
element zeroLengthSection 1 1 2 1 -orient 1 0 0
fix 1 1 1 1
fix 2 0 1 0
timeSeries Linear 1 -factor 1
timeSeries Linear 2 -factor 1
recorder Node -file out/disp.out -time -node 1 2 -dof 1 2 3 disp
recorder Node -file out/reaction.out -time -node 1 2 -dof 1 2 3 reaction
recorder Element -file out/eleForce.out -time -ele 1 force
pattern Plain 1 1 -fact 1 {
    load 2 -800000 0 0
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
pattern Plain 2 2 -fact 1 {
    load 2 0 0 1
}
constraints Plain
numberer RCM
system BandGeneral
test NormDispIncr 0.000001 25
algorithm Newton
integrator DisplacementControl 2 3 0.0001
analysis Static
analyze 200
