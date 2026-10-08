# Máquina de escribir — diseño

Fecha: 2026-10-08
Estado: aprobado (dirección), en implementación

## Qué es

Una experiencia a pantalla completa: una hoja de papel en 3D que ocupa el
encuadre, sostenida por el rodillo de una máquina de escribir que asoma
por arriba. El usuario escribe con el teclado y las letras aparecen
impresas sobre la hoja, con la física y las imperfecciones de una máquina
real. La hoja es infinita: al avanzar de renglón sube y lo escrito se va
saliendo por arriba del cuadro.

No es un editor. Es un objeto. El valor está en cómo se siente escribir.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
| --- | --- | --- |
| Encuadre | Hoja + rodillo, resto fuera de cuadro | La hoja es lo que se mira. El rodillo da contexto vintage con poco espacio y habilita el detalle que vende la ilusión: el papel se mueve. |
| Comportamiento | Fiel y brutal — sin backspace | Obliga a pensar antes de escribir. Es el punto de la pieza. |
| Fin de hoja | Infinita, scroll hacia arriba | Hipnótico y sin estado que administrar. |
| Texto | Mallas 3D de lettra sobre el papel | Nitidez máxima (MSDF en espacio de pantalla) y control total del material vía `buildTextGraph()`. |
| Tipografía | Courier Prime 400 (SIL OFL) | Limpia. El desgaste lo pone el shader, así nunca se repite. Special Elite trae el grunge dibujado dentro de la fuente y la misma letra sale rota igual siempre. |
| Audio | Sintetizado en WebAudio | Variación infinita, cero assets. Con samples el loop se escucha a la tercera línea. |
| Luz | HDRI `brown_photostudio_02` de Poly Haven | Luz de estudio cálida, contraste medio. El rodillo metálico agarra un specular lindo. |
| Papel | Ruido de fibra procedural en TSL | Poly Haven no tiene ninguna textura de papel (866 texturas, cero en la categoría). Y a pantalla completa una foto repetiría features macro visibles. |

## Arquitectura

Cuatro capas, sin que ninguna sepa de la de arriba.

### `src/core/` — dominio puro

Cero Three.js, cero React, cero DOM. Determinista y testeable.

- **`typewriter-machine.ts`** — la máquina de estados. Un objeto inmutable
  `{ lines: string[], column: number }` y transiciones puras:
  `strike(char)`, `carriageReturn()`, `tab()`. Reglas: ancho de margen en
  columnas, campanazo a N columnas del margen, el carro **no retrocede**.
  Al pasarse del margen la tecla no imprime (como la real: se traba).
- **`overstrike.ts`** — qué hace backspace. En la real, retroceder e
  imprimir encima tacha. Modelamos eso: backspace mueve el carro atrás sin
  borrar, y la siguiente tecla queda superpuesta.

Esta capa es la que lleva tests. Las reglas de margen, campana y retorno
de carro son exactamente el tipo de lógica que se rompe sin avisar.

### `src/gl/` — la escena

- **`nodes/paper-curl.ts`** — la función TSL de curvatura. Toma una
  posición local y devuelve la posición curvada alrededor del rodillo, más
  la normal corregida. **Un solo archivo, dos consumidores**: el material
  del papel y el de la tinta. Que compartan esta función es lo que mantiene
  las letras pegadas al papel cuando se dobla.
- **`nodes/ink-material.ts`** — el material de tinta. Arranca de
  `buildTextGraph()` de lettra (que devuelve las etapas TSL sueltas) y
  agrega:
  - jitter por glifo desde el atributo `glyphIndex` — cada letra entra con
    desplazamiento vertical mínimo, rotación de fracción de grado y
    densidad de tinta distinta
  - sangrado de fibra: muestrea la textura del papel en la misma UV y la
    mezcla dentro de la tinta, para que el grano se vea debajo
  - la curvatura compartida en `positionNode`
- **`nodes/paper-material.ts`** — fibra procedural, amarilleo sutil hacia
  los bordes, rugosidad alta.
- **`objects/document.ts`** — el pool de renglones. **Un `createText` por
  línea**, no uno para todo el documento: solo la línea activa llama a
  `setText()` por tecla, las terminadas quedan congeladas, y las que salen
  del cuadro se reciclan. Costo constante por pulsación sin importar cuánto
  llevás escrito.
- **`objects/roller.ts`** — rodillo + perillas. Procedural por ahora;
  se reemplaza por un GLB de Blender cuando el MCP esté conectado.
- **`renderer.ts`**, **`scene.ts`** — WebGPURenderer (cae a WebGL2 solo),
  cámara, environment map.

### `src/audio/` — síntesis

`typewriter-audio.ts` con cuatro voces: `strike()` (ráfaga de ruido
filtrada + resonancia metálica, con variación por llamada), `bell()`,
`carriageReturn()`, `platenAdvance()`. Arranca suspendido hasta el primer
gesto del usuario, como manda el navegador.

### `src/components/` — React

React solo monta y conecta. Ningún estado de la máquina vive en React:
las pulsaciones van directo al core y de ahí al GL, sin re-render.

## Flujo de datos

```
keydown → TypewriterMachine.strike(c) → nuevo estado
                                          ├→ document.sync(estado)   (solo la línea activa relayouta)
                                          └→ audio.strike()
```

El scroll no es un estado aparte: la cantidad de líneas define una Y
objetivo y el papel la persigue con un resorte amortiguado cada frame.

## Accesibilidad

La pieza es puro teclado por naturaleza, pero eso no la hace accesible sola.

- El foco vive en un `<textarea>` visualmente oculto pero real. Eso da
  teclado móvil, soporte de IME y que un lector de pantalla lo anuncie como
  campo de texto. Las teclas se interceptan y se enrutan al core.
- Región `aria-live="polite"` que anuncia la línea al completarse.
- **Foco visible**: cuando el textarea tiene foco, el papel lleva un halo.
  Nunca `outline: none` pelado.
- `prefers-reduced-motion`: se apaga el bamboleo del papel y el scroll
  pasa a ser inmediato. El texto sigue apareciendo.
- Un hint "empezá a escribir" que se desvanece en la primera tecla.

## Manejo de errores

- **Sin WebGPU ni WebGL2**: cartel honesto en vez de canvas negro.
- **Falla la carga del atlas o el HDRI**: la escena arranca igual sin
  environment map; el texto es lo que no puede faltar, y si falla eso, el
  cartel.
- **Teclas no imprimibles** (F1, flechas, meta): se ignoran sin sonido.

## Testing

- `src/core/` con Vitest, escrito antes que la implementación: márgenes,
  posición de campana, retorno de carro, overstrike, ausencia de borrado.
- El GL no se testea unitariamente. Se verifica corriendo y mirando.

## Riesgos conocidos

- `lettra/three` importa `three/webgpu`, que es ESM puro. El canvas se
  monta con `dynamic(..., { ssr: false })`.
- `renderer.init()` es asíncrono. Nada se agrega a la escena antes.
- Courier Prime horneó con 0 pares de kerning — correcto y esperado: es
  monoespaciada, todos los glifos tienen el mismo avance.

## Fuera de alcance

Exportar, guardar, compartir, varias hojas, teclas animadas, máquina
completa, multijugador.
