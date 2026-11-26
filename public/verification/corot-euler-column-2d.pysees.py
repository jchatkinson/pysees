import openseespy.opensees as ops

# @pysees project {"ndf":3,"ndm":2,"nextIds":{"beamIntegration":1,"element":11,"geomTransf":2,"material":1,"misc":1,"mpConstraint":1,"node":12,"pattern":2,"region":1,"section":1,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 2, '-ndf', 3)
ops.node(1, 0, 0)
ops.node(2, 0.0003090169943749474, 0.1)
ops.node(3, 0.0005877852522924731, 0.2)
ops.node(4, 0.0008090169943749475, 0.3)
ops.node(5, 0.0009510565162951536, 0.4)
ops.node(6, 0.001, 0.5)
ops.node(7, 0.0009510565162951537, 0.6)
ops.node(8, 0.0008090169943749475, 0.7)
ops.node(9, 0.0005877852522924732, 0.8)
ops.node(10, 0.0003090169943749475, 0.9)
ops.node(11, 1.2246467991473531e-19, 1)
ops.geomTransf('Corotational', 1)
ops.element('elasticBeamColumn', 1, 1, 2, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 2, 2, 3, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 3, 3, 4, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 4, 4, 5, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 5, 5, 6, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 6, 6, 7, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 7, 7, 8, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 8, 8, 9, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 9, 9, 10, 100, 10000, 0.0001, 1)
ops.element('elasticBeamColumn', 10, 10, 11, 100, 10000, 0.0001, 1)
ops.fix(1, 1, 1, 0)
ops.fix(11, 1, 0, 0)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, '-dof', 1, 2, 3, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, '-dof', 1, 2, 3, 'reaction')
ops.recorder('Element', '-file', 'out/eleLocalForce.out', '-time', '-ele', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'localForce')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(11, 0, -1, 0)
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.005,"nodeTag":6,"patterns":[1],"steps":60},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 6, 1, 0.005)
ops.analysis('Static')
ops.analyze(60)
# @pysees analysis end
