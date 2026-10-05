wipe
model BasicBuilder -ndm 3 -ndf 6
node 1 0 0 0
node 2 0 0 3
node 3 4 0 3
mass 3 5 5 5 0 0 0
uniaxialMaterial Elastic 1 30000000000
section Fiber 1 -GJ 1000000 {
    patch rect 1 4 4 -0.2 -0.2 0.2 0.2
}
section Elastic 2 200000000000 0.01 0.0001 0.0002 80000000000 0.0003
geomTransf Linear 1 1 0 0
geomTransf PDelta 2 0 0 1 -jntOffset 0.1 0 0 0 0.1 0
beamIntegration Legendre 1 1 3
element elasticBeamColumn 1 1 2 0.04 30000000000 12000000000 0.001 0.00013 0.00013 1
element dispBeamColumn 2 2 3 2 1
fix 1 1 1 1 1 1 1
timeSeries Linear 1
pattern Plain 1 1 {
    load 3 1000 0 -2000 0 0 0
    eleLoad -ele 1 -type -beamUniform -1 -2 0.5
}
