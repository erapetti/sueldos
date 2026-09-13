/**
 * Los ajustes que la aplicación le hace a `DATABASE_URL`. El de la clave pública es
 * **solo contra loopback**, así que conviene que una regresión rompa un test y no un deploy
 * contra una base remota.
 */
import { describe, expect, it } from 'vitest'
import { urlDeConexion } from '@/lib/db/urlConexion'

const opciones = (url: string) => Object.fromEntries(new URL(urlDeConexion(url)).searchParams)

describe('cadena de conexión', () => {
  it('fuerza la zona UTC', () => {
    expect(opciones('mysql://u:p@127.0.0.1:3306/sueldos').timezone).toBe('Z')
  })

  it('respeta la zona si ya viene puesta', () => {
    expect(opciones('mysql://u:p@127.0.0.1:3306/sueldos?timezone=local').timezone).toBe('local')
  })

  it('contra loopback habilita pedirle la clave pública al servidor', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      expect(opciones(`mysql://u:p@${host}:3306/sueldos`).allowPublicKeyRetrieval).toBe('true')
    }
  })

  it('contra una base remota NO la habilita: ahí el intercambio se puede interceptar', () => {
    for (const host of ['db.interno', '10.0.0.7', 'mysql.example.com']) {
      expect(opciones(`mysql://u:p@${host}:3306/sueldos`).allowPublicKeyRetrieval).toBeUndefined()
    }
  })

  it('no pisa lo que venga puesto a mano', () => {
    expect(
      opciones('mysql://u:p@127.0.0.1:3306/sueldos?allowPublicKeyRetrieval=false')
        .allowPublicKeyRetrieval,
    ).toBe('false')
  })

  it('una cadena que no es una URL vuelve tal cual, sin romper el arranque', () => {
    expect(urlDeConexion('esto no es una url')).toBe('esto no es una url')
  })
})
