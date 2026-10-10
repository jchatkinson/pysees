wipe
model BasicBuilder -ndm 3 -ndf 6
node 1 0 0 0
node 2 2 0.2 0.62
node 3 2.3 1.7 0.86
node 4 -0.1 1.4 0.10999999999999999
node 5 4.2 0.1 1.27
node 6 4.5 1.6 1.5099999999999998
section ElasticMembranePlateSection 1 30000 0.25 0.4 0.002
element ShellMITC4 1 1 2 3 4 1
element ShellMITC4 2 2 5 6 3 1
fix 1 1 1 1 1 1 1
fix 4 1 1 1 1 1 1
timeSeries Linear 1 -factor 1
pattern Plain 1 1 -fact 1 {
    load 5 1 -2 3 0.5 -0.7 0.2
    load 6 -0.5 1.5 -4 0.1 0.3 -0.9
    eleLoad -ele 1 2 -type -selfWeight 0 0 9.81
    # shell pressure from element 1
    load 1 -0.08006249999999997 -0.026687499999999986 0.2668749999999998 0 0 0
    # shell pressure from elements 1, 2
    load 2 -0.16852499999999998 -0.056174999999999975 0.5617499999999999 0 0 0
    # shell pressure from elements 1, 2
    load 3 -0.17351249999999996 -0.05783749999999996 0.5783749999999998 0 0 0
    # shell pressure from element 1
    load 4 -0.08504999999999996 -0.028349999999999986 0.2834999999999998 0 0 0
    # shell pressure from element 2
    load 5 -0.0874125 -0.029137499999999983 0.29137500000000005 0 0 0
    # shell pressure from element 2
    load 6 -0.0874125 -0.029137499999999983 0.29137500000000005 0 0 0
}
