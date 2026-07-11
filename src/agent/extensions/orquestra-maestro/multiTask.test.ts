import { describe, expect, it } from 'vitest'
import { hasMultipleTasks, isPureQuestion } from './multiTask'

describe('hasMultipleTasks', () => {
  it('detects HTML+CSS+JS calculator as multi-task', () => {
    expect(hasMultipleTasks('Cria HTML, CSS e JS de uma calculadora simples.')).toBe(true)
    expect(hasMultipleTasks('Preciso de HTML+CSS+JS de uma calculadora')).toBe(true)
  })

  it('detects landing + scraper', () => {
    expect(hasMultipleTasks('Crie uma landing page dark e um scraper Python')).toBe(true)
  })

  it('detects explicit orchestration words', () => {
    expect(hasMultipleTasks('Implemente o login usando workers')).toBe(true)
  })

  it('does not flag pure trivia', () => {
    expect(hasMultipleTasks('Qual a capital do Brasil?')).toBe(false)
    expect(hasMultipleTasks('What is 2+2?')).toBe(false)
  })
})

describe('isPureQuestion', () => {
  it('allows short Q&A', () => {
    expect(isPureQuestion('Qual a capital do Brasil?')).toBe(true)
  })

  it('rejects implementation asks', () => {
    expect(isPureQuestion('Cria um botão azul')).toBe(false)
  })
})
