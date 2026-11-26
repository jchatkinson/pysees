import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":2,"element":3,"geomTransf":2,"material":3,"misc":1,"mpConstraint":1,"node":4,"pattern":2,"region":1,"section":2,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 0, 0, 2)
ops.node(3, 0, 0, 4)
ops.uniaxialMaterial('Steel01', 1, 400000000, 200000000000, 0.01)
ops.uniaxialMaterial('Concrete01', 2, -30000000, -0.002, -6000000, -0.006)
ops.section('Fiber', 1, '-GJ', 10000000)
ops.patch('rect', 2, 6, 4, -0.25, -0.2, 0.25, 0.2)
ops.fiber(-0.2, -0.15, 0.0003, 1)
ops.fiber(-0.2, 0.15, 0.0003, 1)
ops.fiber(0.2, -0.15, 0.0003, 1)
ops.fiber(0.2, 0.15, 0.0003, 1)
ops.geomTransf('Linear', 1, 1, 0, 0)
ops.beamIntegration('Legendre', 1, 1, 3)
ops.element('dispBeamColumn', 1, 1, 2, 1, 1)
ops.element('dispBeamColumn', 2, 2, 3, 1, 1)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleLocalForce.out', '-time', '-ele', 1, 2, 'localForce')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(3, 1, 0, 0, 0, 0, 0)
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.0016,"nodeTag":3,"patterns":[1],"steps":60},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 3, 1, 0.0016)
ops.analysis('Static')
ops.analyze(60)
# @pysees analysis end
