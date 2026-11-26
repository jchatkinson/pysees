import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":1,"element":3,"geomTransf":1,"material":1,"misc":1,"mpConstraint":1,"node":7,"pattern":2,"region":1,"section":2,"timeSeries":2},"version":1}
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
ops.section('ElasticMembranePlateSection', 1, 30000, 0.25, 0.4, 0.002)
ops.element('ShellMITC4', 1, 1, 2, 3, 4, 1)
ops.element('ShellMITC4', 2, 2, 5, 6, 3, 1)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.fix(4, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, 5, 6, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, 5, 6, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleForce.out', '-time', '-ele', 1, 2, 'force')
ops.recorder('Element', '-file', 'out/eleShellStress.out', '-time', '-ele', 1, 2, 'stresses')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(5, 1, -2, 3, 0.5, -0.7, 0.2)
ops.load(6, -0.5, 1.5, -4, 0.1, 0.3, -0.9)
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
