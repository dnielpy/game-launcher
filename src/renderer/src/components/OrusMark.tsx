import logo from '../assets/logo.png'

/** The Orus logo: a blue controller on a white rounded square. Same artwork as resources/logo.png and the app icon. */
export function OrusMark({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src={logo} alt="" draggable={false} className={`${className} select-none object-contain`} />
}
