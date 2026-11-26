import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":1,"element":9,"geomTransf":1,"material":1,"misc":1,"mpConstraint":1,"node":16,"pattern":3,"region":1,"section":2,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
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
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleForce.out', '-time', '-ele', 1, 2, 3, 4, 5, 6, 7, 8, 'force')
ops.recorder('Element', '-file', 'out/eleShellStress.out', '-time', '-ele', 1, 2, 3, 4, 5, 6, 7, 8, 'stresses')
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-eigen-analysis","params":{"modes":3},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.eigen(3)
# @pysees analysis end
# @pysees entity {"id":1,"kind":"pattern","name":"Self weight"}
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.eleLoad('-ele', 1, 2, 3, 4, 5, 6, 7, 8, '-type', '-selfWeight', 0, 0, 9.81)
# @pysees entity {"id":2,"kind":"pattern","name":"Imposed load"}
ops.pattern('Plain', 2, 1, '-fact', 1)
# @pysees generated begin {"children":[{"child":{"args":{"eleTags":[1,2,3,4,5,6,7,8],"loadType":"Shell pressure","pressure":-5000},"kind":"eleLoad"},"index":0}],"kind":"shellLoads","patternId":2}
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
# @pysees generated end
# @pysees analysis begin {"command":{"blockId":"run-gravity-analysis","params":{"patterns":[1,2],"steps":4},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('LoadControl', 0.25)
ops.analysis('Static')
ops.analyze(4)
ops.loadConst('-time', 0)
# @pysees analysis end
