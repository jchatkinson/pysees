import openseespy.opensees as ops

# @pysees project {"ndf":3,"ndm":2,"nextIds":{"beamIntegration":1,"element":2,"geomTransf":2,"material":1,"misc":1,"mpConstraint":1,"node":3,"pattern":3,"region":1,"section":1,"timeSeries":3},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 2, '-ndf', 3)
ops.node(1, 0, 0)
ops.node(2, 0, 3)
ops.geomTransf('PDelta', 1)
ops.element('elasticBeamColumn', 1, 1, 2, 0.01, 200000000000, 0.0001, 1)
ops.fix(1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
ops.timeSeries('Linear', 2, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 'reaction')
ops.recorder('Element', '-file', 'out/eleLocalForce.out', '-time', '-ele', 1, 'localForce')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(2, 0, -1000000, 0)
# @pysees analysis begin {"command":{"blockId":"run-gravity-analysis","params":{"holdLoads":"Yes","patterns":[1],"steps":5},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('LoadControl', 0.2)
ops.analysis('Static')
ops.analyze(5)
ops.loadConst('-time', 0)
# @pysees analysis end
ops.pattern('Plain', 2, 2, '-fact', 1)
ops.load(2, 1, 0, 0)
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.002,"nodeTag":2,"patterns":[2],"steps":25},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, 0.002)
ops.analysis('Static')
ops.analyze(25)
# @pysees analysis end
