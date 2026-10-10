/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGroundMotion, pathSeries } from './groundMotion'

describe('ground-motion records', () => {
  it('reads the supplied legacy PEER NGA record without counting headers as data', () => {
    const record = parseGroundMotion(readFileSync('public/LOS000.AT2', 'utf8'))
    expect(record.format).toBe('PEER'); expect(record.values).toHaveLength(1999)
    expect(record.dt).toBe(0.01); expect(record.units).toBe('g')
    expect(record.values[0]).toBe(0.000840908)
    expect(pathSeries({ values: record.values, dt: record.dt, factor: 9.80665 }).times.at(-1)).toBeCloseTo(19.98)
  })
  it('reads modern NGA headers, packed values and Fortran exponents', () => {
    expect(parseGroundMotion('PEER\nACCELERATION IN UNITS OF G\nNPTS= 3, DT= .02 SEC\n1D-3 2e-3\n-3e-3').values).toEqual([0.001, 0.002, -0.003])
  })
  it('reads CSV with headers and nonuniform explicit times', () => {
    const r = parseGroundMotion('Station example\ntime,acceleration\n0,0\n0.01,2\n0.03,-1')
    expect(r.times).toEqual([0, 0.01, 0.03]); expect(r.dt).toBeUndefined()
  })
  it('lets the user choose columns in a numeric table', () => {
    const r = parseGroundMotion('index,accel,time\n1,0,0\n2,2,.1\n3,-1,.2', { layout: 'table', timeColumn: 2, valueColumn: 1 })
    expect(r.times).toEqual([0, 0.1, 0.2]); expect(r.values).toEqual([0, 2, -1])
  })
  it('reads one sample per line, comments, BOM, CRLF and dt metadata', () => {
    const r = parseGroundMotion('\uFEFFStation: example\r\nDT = 0.02\r\n# data\r\n0\r\n2\r\n-1\r\n')
    expect(r.values).toEqual([0, 2, -1]); expect(r.dt).toBe(0.02)
  })
  it('does not silently discard corrupt or missing samples', () => {
    expect(() => parseGroundMotion('NPTS=3, DT=.1\n0 1')).toThrow('declares 3')
    expect(() => parseGroundMotion('header\n0\n1\nnot a sample\n2')).toThrow('line 4')
    expect(() => parseGroundMotion('t,a\n0,1\n0,2')).toThrow('strictly increasing')
    expect(() => parseGroundMotion('1 2 3\n4 5 6')).toThrow('Choose packed')
  })
  it('keeps authored samples unchanged and supports zero and negative factors', () => {
    const values = [1, 2, -3]
    expect(pathSeries({ values, dt: .1, factor: 0 }).factors).toEqual([0, 0, -0])
    expect(pathSeries({ values, dt: .1, factor: -2, '-prependZero': true }).factors).toEqual([-0, -2, -4, 6])
    expect(values).toEqual([1, 2, -3])
    expect(() => pathSeries({ values, dt: 0 })).toThrow('greater than zero')
    expect(() => pathSeries({ values, filePath: 'record.txt', dt: .1 })).toThrow('embed')
    expect(() => pathSeries({ values, time: [0, 1] })).toThrow('Times')
  })
})
