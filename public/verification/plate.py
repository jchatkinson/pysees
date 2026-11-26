import openseespy.opensees as ops

ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 1, 0, 0)
ops.node(3, 2, 0, 0)
ops.node(4, 3, 0, 0)
ops.node(5, 4, 0, 0)
ops.node(6, 0, 1, 0)
ops.node(7, 1, 1, 0)
ops.node(8, 2, 1, 0)
ops.node(9, 3, 1, 0)
ops.node(10, 4, 1, 0)
ops.node(11, 0, 2, 0)
ops.node(12, 1, 2, 0)
ops.node(13, 2, 2, 0)
ops.node(14, 3, 2, 0)
ops.node(15, 4, 2, 0)
ops.section('ElasticMembranePlateSection', 1, 30000000000, 0.2, 0.2, 2400)
ops.element('ShellMITC4', 1, 1, 2, 7, 6, 1)
ops.element('ShellMITC4', 2, 2, 3, 8, 7, 1)
ops.element('ShellMITC4', 3, 3, 4, 9, 8, 1)
ops.element('ShellMITC4', 4, 4, 5, 10, 9, 1)
ops.element('ShellMITC4', 5, 6, 7, 12, 11, 1)
ops.element('ShellMITC4', 6, 7, 8, 13, 12, 1)
ops.element('ShellMITC4', 7, 8, 9, 14, 13, 1)
ops.element('ShellMITC4', 8, 9, 10, 15, 14, 1)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.fix(6, 1, 1, 1, 1, 1, 1)
ops.fix(11, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleForce.out', '-time', '-ele', 1, 2, 3, 4, 5, 6, 7, 8, 'force')
ops.recorder('Element', '-file', 'out/eleShellStress.out', '-time', '-ele', 1, 2, 3, 4, 5, 6, 7, 8, 'stresses')
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.eigen(3)
# Self weight
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.eleLoad('-ele', 1, 2, 3, 4, 5, 6, 7, 8, '-type', '-selfWeight', 0, 0, 9.81)
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
# shell pressure from element 4
ops.load(5, 0, 0, -1250, 0, 0, 0)
# shell pressure from elements 1, 5
ops.load(6, 0, 0, -2500, 0, 0, 0)
# shell pressure from elements 1, 2, 5, 6
ops.load(7, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 2, 3, 6, 7
ops.load(8, 0, 0, -4999.999999999998, 0, 0, 0)
# shell pressure from elements 3, 4, 7, 8
ops.load(9, 0, 0, -4999.999999999999, 0, 0, 0)
# shell pressure from elements 4, 8
ops.load(10, 0, 0, -2500, 0, 0, 0)
# shell pressure from element 5
ops.load(11, 0, 0, -1249.9999999999998, 0, 0, 0)
# shell pressure from elements 5, 6
ops.load(12, 0, 0, -2499.9999999999995, 0, 0, 0)
# shell pressure from elements 6, 7
ops.load(13, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from elements 7, 8
ops.load(14, 0, 0, -2499.999999999999, 0, 0, 0)
# shell pressure from element 8
ops.load(15, 0, 0, -1249.9999999999998, 0, 0, 0)
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('LoadControl', 0.25)
ops.analysis('Static')
ops.analyze(4)
ops.loadConst('-time', 0)
