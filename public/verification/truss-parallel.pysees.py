import openseespy.opensees as ops

# @pysees project {"ndf":3,"ndm":2,"nextIds":{"beamIntegration":1,"element":4,"geomTransf":1,"material":4,"misc":1,"mpConstraint":1,"node":4,"pattern":2,"region":1,"section":1,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 2, '-ndf', 3)
ops.node(1, 0, 0)
ops.node(2, 4, 0)
ops.node(3, 2, 3)
ops.uniaxialMaterial('Steel01', 1, 355000000, 200000000000, 0.02)
ops.uniaxialMaterial('Elastic', 2, 50000000000)
ops.uniaxialMaterial('Parallel', 3, 1, 2, '-factors', 1, 0.5)
ops.element('Truss', 1, 1, 3, 0.001, 3)
ops.element('Truss', 2, 2, 3, 0.001, 3)
ops.element('Truss', 3, 1, 2, 0.0005, 3)
ops.fix(1, 1, 1, 1)
ops.fix(2, 0, 1, 1)
ops.fix(3, 0, 0, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, '-dof', 1, 2, 3, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, '-dof', 1, 2, 3, 'reaction')
ops.recorder('Element', '-file', 'out/eleForce.out', '-time', '-ele', 1, 2, 3, 'force')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(3, 20000, -100000, 0)
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":2,"increment":-0.0004,"nodeTag":3,"patterns":[1],"steps":60},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 3, 2, -0.0004)
ops.analysis('Static')
ops.analyze(60)
# @pysees analysis end
