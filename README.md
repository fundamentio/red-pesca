# Red de Pesca

Web estática (mobile first) que simula una red de pesca de **200 filas × 10 columnas** (2000 paños).
Toca cualquier paño para registrar concepto, cantidad, costo unitario y nota; el total general se actualiza al instante.

- Total general y conteo de paños en la barra superior.
- Paños coloreados según su costo relativo (mapa de calor).
- Toca el número de fila para ver su subtotal; "Resumen" lista todas las filas con costo.
- Lista de materiales con precio de referencia (USD estimado) y unidad (kg, unidad, jornal): se elige con un toque y llena el costo unitario. Editable en Más → Lista de materiales.
- Exportar CSV, respaldar/restaurar JSON, cambiar moneda.
- Datos guardados en `localStorage` del navegador.

Sin dependencias ni build: `index.html`, `styles.css`, `app.js`. Se publica con GitHub Pages desde la rama `main` (raíz).
