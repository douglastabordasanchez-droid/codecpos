import { describe, it, expect } from 'vitest';
import { transicionValida, NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, decidirTipoDocumentoDian } from './types';

describe('transicionValida — máquina de estados del documento electrónico', () => {
  it('permite el flujo feliz completo: draft → pending → signing → sent → accepted', () => {
    expect(transicionValida('draft', 'pending')).toBe(true);
    expect(transicionValida('pending', 'signing')).toBe(true);
    expect(transicionValida('signing', 'sent')).toBe(true);
    expect(transicionValida('sent', 'accepted')).toBe(true);
  });

  it('permite contingencia cuando la DIAN no responde', () => {
    expect(transicionValida('pending', 'contingency')).toBe(true);
    expect(transicionValida('sent', 'contingency')).toBe(true);
    expect(transicionValida('contingency', 'sent')).toBe(true); // reintento tras 48h
  });

  it('permite reintentar tras un rechazo o error', () => {
    expect(transicionValida('rejected', 'pending')).toBe(true);
    expect(transicionValida('error', 'pending')).toBe(true);
  });

  it('permite anular una factura aceptada (nota de ajuste/crédito)', () => {
    expect(transicionValida('accepted', 'cancelled')).toBe(true);
  });

  it('no permite saltarse la firma ni la transmisión', () => {
    expect(transicionValida('draft', 'sent')).toBe(false);
    expect(transicionValida('draft', 'accepted')).toBe(false);
    expect(transicionValida('pending', 'accepted')).toBe(false);
  });

  it('no permite reactivar un documento cancelado (el número anulado nunca se reutiliza)', () => {
    expect(transicionValida('cancelled', 'draft')).toBe(false);
    expect(transicionValida('cancelled', 'pending')).toBe(false);
  });

  it('no permite retroceder de aceptado a un estado anterior al de anulación', () => {
    expect(transicionValida('accepted', 'draft')).toBe(false);
    expect(transicionValida('accepted', 'pending')).toBe(false);
    expect(transicionValida('accepted', 'sent')).toBe(false);
  });
});

describe('constantes DIAN', () => {
  it('el número de documento para consumidor final es el valor oficial de 12 dígitos', () => {
    expect(NUMERO_DOCUMENTO_CONSUMIDOR_FINAL).toBe('222222222222');
    expect(NUMERO_DOCUMENTO_CONSUMIDOR_FINAL).toHaveLength(12);
  });
});

describe('decidirTipoDocumentoDian — Resolución 000165: factura si el comprador está identificado', () => {
  it('comprador con NIT/cédula real → factura (CUFE)', () => {
    expect(decidirTipoDocumentoDian({ numeroDocumento: '1234567890' })).toBe('factura');
  });

  it('comprador con el número oficial de consumidor final → documento equivalente (CUDE)', () => {
    expect(decidirTipoDocumentoDian({ numeroDocumento: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL })).toBe('documento_equivalente');
  });

  it('sin número de documento (vacío) → documento equivalente', () => {
    expect(decidirTipoDocumentoDian({ numeroDocumento: '' })).toBe('documento_equivalente');
  });

  it('número de documento con solo espacios → documento equivalente', () => {
    expect(decidirTipoDocumentoDian({ numeroDocumento: '   ' })).toBe('documento_equivalente');
  });
});
