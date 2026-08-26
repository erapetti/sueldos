/**
 * Texto de chip de dos palabras, partido en dos renglones.
 *
 * En los listados los chips van al lado del alias y compiten por el ancho con todo lo demás.
 * «Falta liquidación» en un renglón es el elemento más ancho de la fila; apilado ocupa poco
 * más que la palabra más larga, que es la mitad. Abajo de `sm`, donde el chip empujaba el
 * nombre a envolver, es la diferencia entre una fila de dos renglones y una de tres.
 *
 * Solo parte lo de **exactamente dos palabras**: una sola no tiene dónde partirse, y de tres
 * para arriba la columna de texto queda tan angosta que se lee peor de lo que ahorra.
 */
export function TextoDeChip({ children }: { children: string }) {
  const palabras = children.split(' ')
  if (palabras.length !== 2) return <>{children}</>

  return (
    <span className="flex flex-col items-center leading-[1.2]">
      <span>{palabras[0]}</span>
      <span>{palabras[1]}</span>
    </span>
  )
}
