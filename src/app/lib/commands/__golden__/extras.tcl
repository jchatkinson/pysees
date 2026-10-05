wipe
model BasicBuilder -ndm 2 -ndf 3
node 1 0 0
node 2 4 0
node 3 2 3
mass 3 10 10 0
uniaxialMaterial Elastic 1 200000000000
uniaxialMaterial Steel01 2 355000000 200000000000 0.01
element Truss 1 1 3 0.001 1
element Truss 2 2 3 0.002 2
equalDOF 1 2 2
fix 1 1 1 0
fix 2 0 1 0
timeSeries Linear 1 -factor 2
pattern Plain 1 1 -fact 1.5 {
    load 3 1000 -2000 0
    sp 3 1 0.01
}
