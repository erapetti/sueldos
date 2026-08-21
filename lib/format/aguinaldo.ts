/** §7.7 — el aguinaldo se liquida en junio y en diciembre. Sirve del lado del cliente. */
export function mesDeAguinaldo(referencia: Date = new Date()): boolean {
  const mes = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', month: '2-digit' }).format(
      referencia,
    ),
  )
  return mes === 6 || mes === 12
}
