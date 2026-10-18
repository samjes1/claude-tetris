---
name: clima
description: Obtiene el clima actual y pronóstico de la ubicación local del usuario (detectada por IP) o de una ciudad dada. Usar cuando el usuario pida el clima, tiempo, temperatura, lluvia o pronóstico, o invoque /clima [ciudad].
argument-hint: "[ciudad] [--pronostico]"
allowed-tools: Bash(curl:*)
---

# Clima local

Fuente: [wttr.in](https://wttr.in) — sin API key. Sin ciudad, detecta ubicación por IP.

## Argumentos

`$ARGUMENTS`

- Vacío → ubicación local (IP).
- Ciudad (ej. `Madrid`, `New York`) → esa ciudad. Espacios → `+`.
- Contiene `--pronostico` → incluir pronóstico 3 días.

## Pasos

1. **Clima actual** (una línea, métrico, español):

   ```bash
   curl -s -m 15 "https://wttr.in/<CIUDAD>?format=%l:+%c+%t+(sensacion+%f),+humedad+%h,+viento+%w,+lluvia+%p,+UV+%u&lang=es&m"
   ```

   `<CIUDAD>` vacío para ubicación local. No meter acentos en la URL.

2. **Pronóstico** (solo si `--pronostico` o el usuario lo pide):

   ```bash
   curl -s -m 15 "https://wttr.in/<CIUDAD>?format=j1&lang=es" 
   ```

   Del JSON, por cada `weather[]` (3 días) extraer: `date`, `mintempC`, `maxtempC`, `hourly[4].lang_es[0].value` (descripción mediodía), máx. `hourly[].chanceofrain`.

3. **Fallback** si wttr.in falla o tarda (respuesta vacía / error):

   ```bash
   curl -s -m 15 "https://ipapi.co/json/"   # → latitude, longitude, city
   curl -s -m 15 "https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto"
   ```

   Traducir `weather_code` (WMO): 0 despejado, 1-3 parcial/nublado, 45/48 niebla, 51-57 llovizna, 61-67 lluvia, 71-77 nieve, 80-82 chubascos, 95-99 tormenta.

## Salida

Concisa, español. Formato:

```
📍 <ciudad>
🌡️ <temp> (sensación <f>) · <condición>
💧 Humedad <h> · 💨 Viento <w> · 🌧️ <p>
```

Con pronóstico, tabla: Día | Mín | Máx | Condición | Lluvia %.

Si la ubicación por IP parece incorrecta (VPN), avisar en una línea y sugerir `/clima <ciudad>`.
