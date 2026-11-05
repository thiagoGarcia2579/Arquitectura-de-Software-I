export type Rol = 'inspector' | 'supervisor' | 'administrativo';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface Usuario {
  id: string;
  rol: Rol;
  nombre: string;
}

// GET /api/inspecciones (supervisor / inspector)
export interface Inspeccion {
  id: string;
  expedienteId: string;
  direccion: string;
  inspectorId: string | null;
  creadaEn: string;
}

// GET /mobile/inspecciones: versión liviana del BFF (sin inspectorId ni creadaEn).
export interface InspeccionLiviana {
  id: string;
  expediente: string;
  direccion: string;
}

export type EstadoActa = 'pendiente_asociacion' | 'asociada' | 'error_asociacion';

export interface Acta {
  id: string;
  inspeccionId: string;
  inspectorId: string;
  observaciones: string;
  cantidadFotos: number;
  estado: EstadoActa;
  creadaEnDispositivo: string | null;
  recibidaEn: string;
  asociadaEn: string | null;
  detalleAsociacion: string | null;
}

export interface ActaNueva {
  inspeccionId: string;
  observaciones: string;
  cantidadFotos: number;
  creadaEnDispositivo: string | null;
}

export type EstadoSync = 'creada' | 'ya_recibida' | 'rechazada';

export interface ResultadoSync {
  id: string | null;
  http: number;
  estado: EstadoSync;
  detalle?: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}
