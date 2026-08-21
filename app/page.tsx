import { redirect } from 'next/navigation'

/** §8.3 — la pantalla de inicio es el listado de empleados. */
export default function Inicio() {
  redirect('/empleados')
}
