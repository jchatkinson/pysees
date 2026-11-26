import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":1,"element":7,"geomTransf":2,"material":1,"misc":1,"mpConstraint":4,"node":15,"pattern":2,"region":1,"section":1,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 4, 0, 0)
ops.node(3, 4, 3, 0)
ops.node(4, 0, 3, 0)
ops.node(5, 0, 0, 3)
ops.node(6, 4, 0, 3)
ops.node(7, 4, 3, 3)
ops.node(8, 0, 3, 3)
ops.node(9, 2.5, 1, 3)
ops.node(10, 7, 0, 0)
ops.node(11, 7, 0, 3)
ops.node(12, 11, 1, 4)
ops.node(13, 10, 0, 0)
ops.node(14, 10, 0, 3)
ops.geomTransf('Linear', 1, 1, 0, 0)
ops.element('elasticBeamColumn', 1, 1, 5, 0.01, 200000000000, 80000000000, 0.0002, 0.0001, 0.000165, 1)
ops.element('elasticBeamColumn', 2, 2, 6, 0.01, 200000000000, 80000000000, 0.0002, 0.0001, 0.00017999999999999998, 1)
ops.element('elasticBeamColumn', 3, 3, 7, 0.01, 200000000000, 80000000000, 0.0002, 0.0001, 0.000195, 1)
ops.element('elasticBeamColumn', 4, 4, 8, 0.01, 200000000000, 80000000000, 0.0002, 0.0001, 0.00020999999999999998, 1)
ops.element('elasticBeamColumn', 5, 10, 11, 0.01, 200000000000, 80000000000, 0.0002, 0.0001, 0.000225, 1)
ops.element('elasticBeamColumn', 6, 13, 14, 0.01, 200000000000, 80000000000, 0.0002, 0.0001, 0.00023999999999999998, 1)
# @pysees entity {"id":1,"kind":"mpConstraint"}
ops.rigidDiaphragm(3, 9, 5, 6, 7, 8)
# @pysees entity {"id":2,"kind":"mpConstraint"}
ops.rigidLink('bar', 14, 11)
# @pysees entity {"id":3,"kind":"mpConstraint"}
ops.rigidLink('beam', 14, 12)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.fix(2, 1, 1, 1, 1, 1, 1)
ops.fix(3, 1, 1, 1, 1, 1, 1)
ops.fix(4, 1, 1, 1, 1, 1, 1)
ops.fix(9, 0, 0, 1, 1, 1, 0)
ops.fix(10, 1, 1, 1, 1, 1, 1)
ops.fix(13, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleLocalForce.out', '-time', '-ele', 1, 2, 3, 4, 5, 6, 'localForce')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(9, 30000, 10000, 0, 0, 0, 20000)
ops.load(12, 0, 5000, -20000, 1000, 0, 0)
ops.load(7, 0, 0, -100000, 0, 0, 0)
# @pysees analysis begin {"command":{"blockId":"run-gravity-analysis","params":{"patterns":[1],"steps":2},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Transformation')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('LoadControl', 0.5)
ops.analysis('Static')
ops.analyze(2)
ops.loadConst('-time', 0)
# @pysees analysis end
