wipe
model BasicBuilder -ndm 3 -ndf 6
node 1 0 0 0
node 2 2 0.2 0.62
node 3 2.3 1.7 0.86
node 4 -0.1 1.4 0.10999999999999999
node 5 4.2 0.1 1.27
node 6 4.5 1.6 1.5099999999999998
node 7 6 0.9 1.89
section ElasticMembranePlateSection 1 30000 0.25 0.4 0.002
element ShellMITC4 1 1 2 3 4 1
element ShellMITC4 2 2 5 6 3 1
element ShellDKGT 3 5 7 6 1
fix 1 1 1 1 1 1 1
fix 4 1 1 1 1 1 1
timeSeries Linear 1 -factor 1
pattern Plain 1 1 -fact 1 {
    load 5 1 -2 3 0.5 -0.7 0.2
    load 6 -0.5 1.5 -4 0.1 0.3 -0.9
    eleLoad -ele 1 2 -type -selfWeight 0 0 9.81
}
