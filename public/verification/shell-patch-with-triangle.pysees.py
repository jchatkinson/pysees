import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":1,"element":4,"geomTransf":1,"material":1,"misc":1,"mpConstraint":1,"node":8,"pattern":2,"region":1,"section":2,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 2, 0.2, 0.62)
ops.node(3, 2.3, 1.7, 0.86)
ops.node(4, -0.1, 1.4, 0.10999999999999999)
ops.node(5, 4.2, 0.1, 1.27)
ops.node(6, 4.5, 1.6, 1.5099999999999998)
ops.node(7, 6, 0.9, 1.89)
ops.section('ElasticMembranePlateSection', 1, 30000, 0.25, 0.4, 0.002)
ops.element('ShellMITC4', 1, 1, 2, 3, 4, 1)
ops.element('ShellMITC4', 2, 2, 5, 6, 3, 1)
ops.element('ShellDKGT', 3, 5, 7, 6, 1)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.fix(4, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleForce-ShellMITC4.out', '-time', '-ele', 1, 2, 'force')
ops.recorder('Element', '-file', 'out/eleForce-ShellDKGT.out', '-time', '-ele', 3, 'force')
ops.recorder('Element', '-file', 'out/eleShellStress-ShellMITC4.out', '-time', '-ele', 1, 2, 'stresses')
ops.recorder('Element', '-file', 'out/eleShellStress-ShellDKGT.out', '-time', '-ele', 3, 'stresses')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(5, 1, -2, 3, 0.5, -0.7, 0.2)
ops.load(6, -0.5, 1.5, -4, 0.1, 0.3, -0.9)
# @pysees generated begin {"children":[{"child":{"args":{"bx":0,"by":0,"bz":-9.81,"eleTags":[1,2,3],"loadType":"Shell self-weight"},"kind":"eleLoad"},"index":2},{"child":{"args":{"eleTags":[1,2,3],"loadType":"Shell pressure","pressure":0.35},"kind":"eleLoad"},"index":3}],"kind":"shellLoads","patternId":1}
ops.eleLoad('-ele', 1, 2, '-type', '-selfWeight', 0, 0, 9.81)
# shell pressure from element 1
ops.load(1, -0.08006249999999997, -0.026687499999999986, 0.2668749999999998, 0, 0, 0)
# shell pressure from elements 1, 2
ops.load(2, -0.16852499999999998, -0.056174999999999975, 0.5617499999999999, 0, 0, 0)
# shell pressure from elements 1, 2
ops.load(3, -0.17351249999999996, -0.05783749999999996, 0.5783749999999998, 0, 0, 0)
# shell pressure from element 1
ops.load(4, -0.08504999999999996, -0.028349999999999986, 0.2834999999999998, 0, 0, 0)
# shell pressure from elements 2, 3
ops.load(5, -0.1304625, -0.04348749999999997, 0.43487500000000007, 0, 0, 0)
# shell pressure from elements 2, 3
ops.load(6, -0.1304625, -0.04348749999999997, 0.43487500000000007, 0, 0, 0)
# shell pressure from element 3
ops.load(7, -0.043050000000000005, -0.01434999999999999, 0.14350000000000002, 0, 0, 0)
# shell self-weight from element 3
ops.load(5, 0, 0, -0.0033747312545801336, 0, 0, 0)
# shell self-weight from element 3
ops.load(6, 0, 0, -0.0033747312545801336, 0, 0, 0)
# shell self-weight from element 3
ops.load(7, 0, 0, -0.0033747312545801336, 0, 0, 0)
# @pysees generated end
# @pysees analysis begin {"command":{"blockId":"run-gravity-analysis","params":{"patterns":[1],"steps":2},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('LoadControl', 0.5)
ops.analysis('Static')
ops.analyze(2)
ops.loadConst('-time', 0)
# @pysees analysis end
