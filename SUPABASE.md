# Conectar Ritmo con Supabase

## 1. Completa las claves del proyecto

1. Entra a tu proyecto de Supabase.
2. Abre **Project Settings (Configuración del proyecto) → API Keys**.
3. Copia la **Project URL** y la **Publishable key**.
4. Abre el archivo `.env` que está en la carpeta de la app y reemplaza los dos textos de ejemplo:

   - `NEXT_PUBLIC_SUPABASE_URL`: pega la Project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: pega la Publishable key.

No compartas ninguna clave `secret` o `service_role`. La app solo usa la Publishable key; el acceso a los datos queda limitado por las reglas de seguridad de la base.

## 2. Crea las tablas y activa sus protecciones

1. En Supabase, abre **SQL Editor** en el menú de la izquierda.
2. Elige **New query**.
3. Abre `supabase/schema.sql` desde esta carpeta y copia todo su contenido.
4. Pégalo en el editor de Supabase.
5. Pulsa **Run**.
6. Comprueba que Supabase indique que la consulta terminó correctamente.

El archivo crea dos tablas: `habits` (los hábitos y su dueño) y `habit_completions` (los días marcados). Activa Row Level Security en ambas. Las reglas permiten que cada persona vea y cambie sus hábitos y sus marcas; una marca también debe pertenecer a un hábito propio. Al borrar un hábito, Supabase borra sus marcas asociadas.

## 3. Inicia la app

Si la app ya está abierta, detenla con `Ctrl+C` y vuelve a iniciarla para que lea `.env`:

```powershell
cd C:\dev\mi_app
npm.cmd run dev
```

Abre [http://localhost:3000](http://localhost:3000), crea una cuenta con correo y contraseña, e inicia sesión. Si Supabase te pide confirmar el correo, abre el mensaje que te envíe y confirma la cuenta antes de iniciar sesión.

La primera vez que inicies sesión en este navegador, la app copiará tus hábitos anteriores a Supabase. Solo borrará esa copia local después de confirmar que también se copiaron los días marcados. A partir de entonces, los hábitos se guardan en Supabase.
