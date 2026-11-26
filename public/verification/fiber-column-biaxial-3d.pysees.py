import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":2,"element":4,"geomTransf":2,"material":3,"misc":1,"mpConstraint":1,"node":5,"pattern":3,"region":1,"section":2,"timeSeries":3},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 0, 0, 1)
ops.node(3, 0, 0, 2)
ops.node(4, 0, 0, 3)
ops.uniaxialMaterial('Concrete01', 1, -30000000, -0.002, -6000000, -0.006)
ops.uniaxialMaterial('Steel01', 2, 400000000, 200000000000, 0.01)
ops.section('Fiber', 1, '-GJ', 200000000)
ops.patch('rect', 1, 10, 6, -0.3, -0.2, 0.3, 0.2)
ops.fiber(-0.25, -0.15000000000000002, 0.0008, 2)
ops.fiber(-0.25, 0.15000000000000002, 0.0008, 2)
ops.fiber(0.25, -0.15000000000000002, 0.0008, 2)
ops.fiber(0.25, 0.15000000000000002, 0.0008, 2)
ops.geomTransf('Linear', 1, 1, 0, 0)
ops.beamIntegration('Legendre', 1, 1, 4)
ops.element('dispBeamColumn', 1, 1, 2, 1, 1)
ops.element('dispBeamColumn', 2, 2, 3, 1, 1)
ops.element('dispBeamColumn', 3, 3, 4, 1, 1)
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
ops.timeSeries('Linear', 2, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, 3, 4, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, 3, 4, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Element', '-file', 'out/eleLocalForce.out', '-time', '-ele', 1, 2, 3, 'localForce')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(4, 0, 0, -1500000, 0, 0, 0)
# @pysees analysis begin {"command":{"blockId":"run-gravity-analysis","params":{"holdLoads":"Yes","maxIter":100,"patterns":[1],"steps":10,"testType":"NormDispIncr","tol":1e-10},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 1e-10, 100)
ops.algorithm('Newton')
ops.integrator('LoadControl', 0.1)
ops.analysis('Static')
ops.analyze(10)
ops.loadConst('-time', 0)
# @pysees analysis end
ops.pattern('Plain', 2, 2, '-fact', 1)
ops.load(4, 1, 1, 0, 0, 0, 0.2)
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.001,"maxIter":100,"nodeTag":4,"patterns":[2],"steps":50,"testType":"NormDispIncr","tol":1e-10},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 1e-10, 100)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 4, 1, 0.001)
ops.analysis('Static')
ops.analyze(50)
# @pysees analysis end
