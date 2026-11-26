import openseespy.opensees as ops

# @pysees project {"ndf":3,"ndm":2,"nextIds":{"beamIntegration":1,"element":3,"geomTransf":1,"material":100,"misc":1,"mpConstraint":1,"node":3,"pattern":2,"region":1,"section":1,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 2, '-ndf', 3)
ops.node(1, 0, 0)
ops.node(2, 1, 0)
ops.uniaxialMaterial('Concrete01', 1, -30000000, -0.002, -6000000, -0.006)
ops.uniaxialMaterial('Elastic', 99, 30000000)
ops.element('Truss', 1, 1, 2, 1, 1)
ops.element('Truss', 2, 1, 2, 1, 99)
ops.fix(1, 1, 1, 1)
ops.fix(2, 0, 1, 1)
ops.timeSeries('Linear', 1, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 'reaction')
ops.recorder('Element', '-file', 'out/eleForce.out', '-time', '-ele', 1, 2, 'force')
# @pysees analysis end
ops.pattern('Plain', 1, 1, '-fact', 1)
ops.load(2, 1, 0, 0)
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":-0.00005,"nodeTag":2,"patterns":[1],"steps":20},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, -0.00005)
ops.analysis('Static')
ops.analyze(20)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.00005,"nodeTag":2,"patterns":[1],"steps":24},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, 0.00005)
ops.analysis('Static')
ops.analyze(24)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":-0.00005,"nodeTag":2,"patterns":[1],"steps":44},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, -0.00005)
ops.analysis('Static')
ops.analyze(44)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.00005,"nodeTag":2,"patterns":[1],"steps":50},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, 0.00005)
ops.analysis('Static')
ops.analyze(50)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":-0.00005000000000000001,"nodeTag":2,"patterns":[1],"steps":90},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, -0.00005000000000000001)
ops.analysis('Static')
ops.analyze(90)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.00005,"nodeTag":2,"patterns":[1],"steps":100},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, 0.00005)
ops.analysis('Static')
ops.analyze(100)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":-0.00005,"nodeTag":2,"patterns":[1],"steps":140},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, -0.00005)
ops.analysis('Static')
ops.analyze(140)
# @pysees analysis end
# @pysees analysis begin {"command":{"blockId":"run-pushover-analysis","params":{"dof":1,"increment":0.00005,"nodeTag":2,"patterns":[1],"steps":120},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Newton')
ops.integrator('DisplacementControl', 2, 1, 0.00005)
ops.analysis('Static')
ops.analyze(120)
# @pysees analysis end
