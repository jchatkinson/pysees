import openseespy.opensees as ops

# @pysees project {"ndf":6,"ndm":3,"nextIds":{"beamIntegration":1,"element":2,"geomTransf":2,"material":1,"misc":1,"mpConstraint":1,"node":3,"pattern":2,"region":1,"section":1,"timeSeries":2},"version":1}
# @pysees layout {"gridlines":[],"levels":[],"nextGridlineId":1,"nextLevelId":1}
# @pysees report {"activeSavedPlotId":null,"nextSavedPlotId":1,"savedPlots":[]}
# @pysees display {"hiddenLoadPatterns":[],"numberFormat":{"digits":5,"labelDigits":3},"plotView":{"maximized":false,"nextSeriesId":1,"open":false,"pos":null,"series":[],"sharedX":true,"showEditor":true,"showStageTicks":true,"showStepMarker":true,"size":{"h":380,"w":520},"x":{"type":"step"}},"resultsView":{"contour":"Mx","contourDeformed":true,"fillDiagrams":true,"fps":5,"loop":true,"modeSpeed":0.5,"scales":{"axial":null,"deformed":null,"mode":null,"moment":null,"momentY":null,"shear":null,"shearZ":null,"torsion":null},"showReactions":false,"showUndeformed":true,"showValues":false,"smooth":true,"type":"none"},"unitPrefs":{},"viewSettings":{}}
ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.node(1, 0, 0, 0)
ops.node(2, 0, 0, 3)
# @pysees generated begin {"kind":"beamMass","nodeId":1,"writes":[]}
ops.mass(1, 0.75, 0.75, 0.75, 0, 0, 0)
# @pysees generated end
# @pysees generated begin {"kind":"beamMass","nodeId":2,"writes":[{"entity":{"nodeId":2,"values":[2,2,2,0,0,0]},"kind":"mass"}]}
ops.mass(2, 2.75, 2.75, 2.75, 0, 0, 0)
# @pysees generated end
ops.geomTransf('Linear', 1, 1, 0, 0)
# @pysees generated begin {"elementId":1,"kind":"beamMass","writes":[{"entity":{"args":{"A":1,"E":1000,"G":400,"Iy":2,"Iz":1,"J":1,"mass":0.5,"transfTag":1},"eleType":"ElasticBeamColumn","id":1,"nodes":[1,2]},"kind":"element"}]}
ops.element('elasticBeamColumn', 1, 1, 2, 1, 1000, 400, 1, 2, 1, 1)
# @pysees generated end
ops.fix(1, 1, 1, 1, 1, 1, 1)
ops.timeSeries('Path', 1, '-dt', 0.01, '-values', 0, 0.10452846326765346, 0.20791169081775931, 0.3090169943749474, 0.40673664307580015, 0.49999999999999994, 0.5877852522924731, 0.6691306063588582, 0.7431448254773942, 0.8090169943749475, 0.8660254037844386, 0.9135454576426009, 0.9510565162951535, 0.9781476007338057, 0.9945218953682733, 1, 0.9945218953682734, 0.9781476007338057, 0.9510565162951536, 0.913545457642601, 0.8660254037844387, 0.8090169943749475, 0.7431448254773945, 0.6691306063588583, 0.5877852522924732, 0.49999999999999994, 0.40673664307580004, 0.3090169943749475, 0.20791169081775931, 0.10452846326765329, 5.66553889764798e-16, -0.10452846326765305, -0.20791169081775907, -0.3090169943749473, -0.4067366430758002, -0.4999999999999997, -0.587785252292473, -0.6691306063588582, -0.743144825477394, -0.8090169943749473, -0.8660254037844385, -0.9135454576426005, -0.9510565162951535, -0.9781476007338056, -0.9945218953682733, -1, -0.9945218953682734, -0.9781476007338056, -0.9510565162951536, -0.9135454576426011, -0.8660254037844386, -0.8090169943749476, -0.743144825477394, -0.6691306063588581, -0.5877852522924734, -0.49999999999999967, -0.40673664307580015, -0.3090169943749476, -0.20791169081775898, -0.10452846326765342, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '-factor', 1)
# @pysees analysis begin {"command":{"blockId":"whole-model-recorder","params":{"directory":"out","dynamic":"Yes"},"type":"ANALYSIS_BLOCK"}}
ops.recorder('Node', '-file', 'out/disp.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 4, 5, 6, 'disp')
ops.recorder('Node', '-file', 'out/reaction.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 4, 5, 6, 'reaction')
ops.recorder('Node', '-file', 'out/vel.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 4, 5, 6, 'vel')
ops.recorder('Node', '-file', 'out/accel.out', '-time', '-node', 1, 2, '-dof', 1, 2, 3, 4, 5, 6, 'accel')
ops.recorder('Element', '-file', 'out/eleLocalForce.out', '-time', '-ele', 1, 'localForce')
# @pysees analysis end
ops.pattern('UniformExcitation', 1, 1, '-accel', 1, '-fact', 1)
# @pysees analysis begin {"command":{"blockId":"run-earthquake-analysis","params":{"algorithm":"Linear","dampingMode":"Modal periods","dampingPercent":5,"dt":0.01,"modalPeriod1":"T1","modalPeriod2":"T3","nSteps":400},"type":"ANALYSIS_BLOCK"}}
ops.constraints('Plain')
ops.numberer('RCM')
ops.system('BandGeneral')
ops.test('NormDispIncr', 0.000001, 25)
ops.algorithm('Linear')
ops.setTime(0)
# PySees: modal damping begin
# Resolve T1 and T3 from the current model state for Rayleigh damping.
_pysees_damping_eigen = ops.eigen('-fullGenLapack', 3)
if not all(0 < value < 1e300 for value in (_pysees_damping_eigen[0], _pysees_damping_eigen[2])): raise ValueError('Requested damping modes must have finite positive eigenvalues')
_pysees_damping_w1 = _pysees_damping_eigen[0] ** 0.5
_pysees_damping_w2 = _pysees_damping_eigen[2] ** 0.5
ops.rayleigh(2 * 0.05 * _pysees_damping_w1 * _pysees_damping_w2 / (_pysees_damping_w1 + _pysees_damping_w2), 2 * 0.05 / (_pysees_damping_w1 + _pysees_damping_w2), 0, 0)
# PySees: modal damping end
ops.integrator('Newmark', 0.5, 0.25)
ops.analysis('Transient')
ops.analyze(400, 0.01)
ops.remove('loadPattern', 1)
# @pysees analysis end
