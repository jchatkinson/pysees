import openseespy.opensees as ops

ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 1, 0, 0)
ops.node(3, 2, 0, 0)
ops.node(4, 3, 0, 0)
ops.node(5, 4, 0, 0)
ops.node(6, 5, 0, 0)
ops.node(7, 6, 0, 0)
ops.node(8, 0, 1, 0)
ops.node(9, 1, 1, 0)
ops.node(10, 2, 1, 0)
ops.node(11, 3, 1, 0)
ops.node(12, 4, 1, 0)
ops.node(13, 5, 1, 0)
ops.node(14, 6, 1, 0)
ops.node(15, 0, 2, 0)
ops.node(16, 1, 2, 0)
ops.node(17, 2, 2, 0)
ops.node(18, 3, 2, 0)
ops.node(19, 4, 2, 0)
ops.node(20, 5, 2, 0)
ops.node(21, 6, 2, 0)
ops.node(22, 0, 3, 0)
ops.node(23, 1, 3, 0)
ops.node(24, 2, 3, 0)
ops.node(25, 3, 3, 0)
ops.node(26, 4, 3, 0)
ops.node(27, 5, 3, 0)
ops.node(28, 6, 3, 0)
ops.section('ElasticMembranePlateSection', 1, 30000000000, 0.2, 0.2, 2400)
ops.element('ShellMITC4', 1, 1, 2, 9, 8, 1)
ops.element('ShellMITC4', 2, 2, 3, 10, 9, 1)
ops.element('ShellMITC4', 3, 3, 4, 11, 10, 1)
ops.element('ShellMITC4', 4, 4, 5, 12, 11, 1)
ops.element('ShellMITC4', 5, 5, 6, 13, 12, 1)
ops.element('ShellMITC4', 6, 6, 7, 14, 13, 1)
ops.element('ShellMITC4', 7, 8, 9, 16, 15, 1)
ops.element('ShellMITC4', 8, 9, 10, 17, 16, 1)
ops.element('ShellMITC4', 9, 10, 11, 18, 17, 1)
ops.element('ShellMITC4', 10, 11, 12, 19, 18, 1)
ops.element('ShellMITC4', 11, 12, 13, 20, 19, 1)
ops.element('ShellMITC4', 12, 13, 14, 21, 20, 1)
ops.element('ShellMITC4', 13, 15, 16, 23, 22, 1)
ops.element('ShellMITC4', 14, 16, 17, 24, 23, 1)
ops.element('ShellMITC4', 15, 17, 18, 25, 24, 1)
ops.element('ShellMITC4', 16, 18, 19, 26, 25, 1)
ops.element('ShellMITC4', 17, 19, 20, 27, 26, 1)
ops.element('ShellMITC4', 18, 20, 21, 28, 27, 1)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.fix(8, 1, 1, 1, 1, 1, 1)
ops.fix(15, 1, 1, 1, 1, 1, 1)
ops.fix(22, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# Self weight
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.eleLoad('-ele', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, '-type', '-selfWeight', 0, 0, 9.81)
# Imposed load
ops.pattern('Plain', 2, 1, '-fact', 1)
# shell pressure from element 1
ops.load(1, 0, 0, -1249.9999999999998, 0, 0, 0)
# shell pressure from elements 1, 2
ops.load(2, 0, 0, -2499.9999999999995, 0, 0, 0)
# shell pressure from elements 2, 3
ops.load(3, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from elements 3, 4
ops.load(4, 0, 0, -2499.9999999999995, 0, 0, 0)
# shell pressure from elements 4, 5
ops.load(5, 0, 0, -2500, 0, 0, 0)
# shell pressure from elements 5, 6
ops.load(6, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from element 6
ops.load(7, 0, 0, -1249.9999999999989, 0, 0, 0)
# shell pressure from elements 1, 7
ops.load(8, 0, 0, -2500, 0, 0, 0)
# shell pressure from elements 1, 2, 7, 8
ops.load(9, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 2, 3, 8, 9
ops.load(10, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 3, 4, 9, 10
ops.load(11, 0, 0, -4999.999999999999, 0, 0, 0)
# shell pressure from elements 4, 5, 10, 11
ops.load(12, 0, 0, -5000, 0, 0, 0)
# shell pressure from elements 5, 6, 11, 12
ops.load(13, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 6, 12
ops.load(14, 0, 0, -2499.9999999999973, 0, 0, 0)
# shell pressure from elements 7, 13
ops.load(15, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from elements 7, 8, 13, 14
ops.load(16, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 8, 9, 14, 15
ops.load(17, 0, 0, -4999.999999999997, 0, 0, 0)
# shell pressure from elements 9, 10, 15, 16
ops.load(18, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 10, 11, 16, 17
ops.load(19, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 11, 12, 17, 18
ops.load(20, 0, 0, -4999.999999999996, 0, 0, 0)
# shell pressure from elements 12, 18
ops.load(21, 0, 0, -2499.9999999999973, 0, 0, 0)
# shell pressure from element 13
ops.load(22, 0, 0, -1249.9999999999995, 0, 0, 0)
# shell pressure from elements 13, 14
ops.load(23, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from elements 14, 15
ops.load(24, 0, 0, -2499.999999999998, 0, 0, 0)
# shell pressure from elements 15, 16
ops.load(25, 0, 0, -2499.999999999998, 0, 0, 0)
# shell pressure from elements 16, 17
ops.load(26, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from elements 17, 18
ops.load(27, 0, 0, -2499.999999999998, 0, 0, 0)
# shell pressure from element 18
ops.load(28, 0, 0, -1249.9999999999984, 0, 0, 0)
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.eigen(4)
