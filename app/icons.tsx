type IconProps = {
    size?: number;
    className?: string;
};

export function IconFolder({ size = 16, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M3 7a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.6L12 7h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
          </svg>
        );
}

export function IconChevronRight({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M9 6l6 6-6 6" />
          </svg>
        );
}

export function IconFlask({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M9.5 3h5" />
                  <path d="M10.5 3v6.2L4.9 18a1.8 1.8 0 0 0 1.55 2.7h11.1A1.8 1.8 0 0 0 19.1 18l-5.6-8.8V3" />
          </svg>
        );
}

export function IconTrash({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M4 7h16" />
                  <path d="M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7" />
                  <path d="M9.5 7V4.8A1 1 0 0 1 10.5 3.8h3a1 1 0 0 1 1 1V7" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
          </svg>
        );
}

export function IconDots({ size = 18, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
          </svg>
        );
}

export function IconSun({ size = 16, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.55 1.55M17.85 17.85l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.55-1.55M17.85 6.15l1.55-1.55" />
          </svg>
        );
}

export function IconMoon({ size = 16, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M21 13.2A9 9 0 1 1 10.8 3 7.2 7.2 0 0 0 21 13.2Z" />
          </svg>
        );
}

export function IconExternalLink({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-8.5 8.5" />
                  <path d="M9 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V15" />
          </svg>
        );
}

export function IconCode({ size = 18, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M8.5 8L4.5 12l4 4" />
                  <path d="M15.5 8l4 4-4 4" />
          </svg>
        );
}

export function IconPencil({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        );
}

export function IconCheck({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        );
}

export function IconMessageCircle({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M12 3.5c-4.7 0-8.5 3.2-8.5 7.1 0 2.5 1.5 4.7 3.9 6l-.9 3.4 3.7-1.9c.6.1 1.2.2 1.8.2 4.7 0 8.5-3.2 8.5-7.1S16.7 3.5 12 3.5Z" />
          </svg>
        );
}

export function IconX({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M5 5l14 14" />
                  <path d="M19 5L5 19" />
          </svg>
        );
}

// Alça de arrastar (reordenar cards na Biblioteca e no Avatar IA, 21/09/2026).
export function IconGripVertical({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
                  <circle cx="9" cy="5" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="9" cy="19" r="1.5" />
                  <circle cx="15" cy="5" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="15" cy="19" r="1.5" />
          </svg>
        );
}

// Adicionar item a uma sequencia (montagem de suite, 22/09/2026).
export function IconPlus({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className}>
                  <path d="M12 5v14M5 12h14" />
          </svg>
        );
}

// Mover um item da sequencia uma casa pra cima / pra baixo — alternativa
// precisa ao arrastar quando a lista e longa (22/09/2026).
export function IconArrowUp({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        );
}

export function IconArrowDown({ size = 14, className }: IconProps) {
    return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                  <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        );
}
