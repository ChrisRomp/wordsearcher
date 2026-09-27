import type { SVGProps } from 'react'
import { FACES } from './fonts'
import { pathData } from './path'
import type { Page } from './types'

export function PageSvg({ page, ...props }: { page: Page } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={`0 0 ${page.width} ${page.height}`} xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width={page.width} height={page.height} fill="#fff" />
      {page.prims.map((p, i) => {
        switch (p.k) {
          case 'text':
            return (
              <text
                key={i}
                x={p.x}
                y={p.y}
                fontFamily={`"${FACES[p.face].family}"`}
                fontSize={p.size}
                fill={p.color}
                textAnchor={p.anchor}
                style={{ whiteSpace: 'pre' }}
              >
                {p.text}
              </text>
            )
          case 'line':
            return (
              <line
                key={i}
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke={p.color}
                strokeWidth={p.width}
                strokeDasharray={p.dash?.join(' ')}
                strokeLinecap="round"
              />
            )
          case 'rect':
            return (
              <rect
                key={i}
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx={p.r}
                fill={p.fill ?? 'none'}
                stroke={p.stroke}
                strokeWidth={p.width}
              />
            )
          case 'path':
            return (
              <path
                key={i}
                d={pathData(p.d)}
                fill={p.fill ?? 'none'}
                fillOpacity={p.fillOpacity}
                stroke={p.stroke}
                strokeWidth={p.width}
                strokeLinejoin="round"
              />
            )
        }
      })}
    </svg>
  )
}
