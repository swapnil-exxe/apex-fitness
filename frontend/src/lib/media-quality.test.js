import { describe, expect, it } from 'vitest'
import { CATALOGUE, EXIDX, imgSrc, gifSrc, isVideoSrc, figureOf } from './exercises.js'

describe('Exercise media quality & integrity', () => {
  it('exercise 4209 maps to original 4209.webp still and 4209.mp4 clip without degradation params', () => {
    const ex4209 = EXIDX['4209']
    expect(ex4209).toBeTruthy()
    expect(ex4209.id).toBe('4209')
    expect(ex4209.n).toBe('1 to 2 jump box')

    const still = imgSrc(ex4209)
    const clip = gifSrc(ex4209)

    expect(still).toBe('exercise-media/still/4209.webp')
    expect(clip).toBe('exercise-media/clip/4209.mp4')
    expect(isVideoSrc(clip)).toBe(true)

    // Ensure no compression/resizing query parameters are appended
    expect(still).not.toContain('?')
    expect(clip).not.toContain('?')
    expect(still.endsWith('.webp')).toBe(true)
    expect(clip.endsWith('.mp4')).toBe(true)
  })

  it('representative exercises 0001 (bench press) and 0002 (deadlift) map to original files', () => {
    const ex0001 = EXIDX['0001']
    const ex0002 = EXIDX['0002']
    expect(ex0001).toBeTruthy()
    expect(ex0002).toBeTruthy()

    expect(imgSrc(ex0001)).toBe('exercise-media/still/0001.webp')
    expect(gifSrc(ex0001)).toBe('exercise-media/clip/0001.mp4')

    expect(imgSrc(ex0002)).toBe('exercise-media/still/0002.webp')
    expect(gifSrc(ex0002)).toBe('exercise-media/clip/0002.mp4')
  })

  it('female and male figure variations preserve original asset extensions and fidelity', () => {
    // Find an exercise that has a female or male variant drawing
    const withDrawing = CATALOGUE.find(e => e.fv || e.mv)
    expect(withDrawing).toBeTruthy()

    const femaleStill = imgSrc(withDrawing, 'female')
    const femaleClip = gifSrc(withDrawing, 'female')

    expect(femaleStill).toMatch(/^exercise-media\/still\/\d+\.webp$/)
    expect(femaleClip).toMatch(/^exercise-media\/clip\/\d+\.mp4$/)
    expect(isVideoSrc(femaleClip)).toBe(true)
  })

  it('all catalogue exercises reference valid original webp stills and mp4 clips', () => {
    expect(CATALOGUE.length).toBeGreaterThan(1000)
    for (const ex of CATALOGUE) {
      if (ex.img) {
        expect(ex.img).toMatch(/\.webp$/)
        expect(imgSrc(ex)).toBe(`exercise-media/still/${ex.img}`)
      }
      if (ex.gif) {
        expect(ex.gif).toMatch(/\.mp4$/)
        expect(gifSrc(ex)).toBe(`exercise-media/clip/${ex.gif}`)
      }
    }
  })
})
