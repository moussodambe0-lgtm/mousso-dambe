/**
 * L'ancienne page d'inscription.
 *
 * Elle n'existe plus : depuis la section 2 du cahier d'Arthur (12 octobre
 * 2026), on entre sans compte. Le fichier reste pour une seule raison : une
 * adresse déjà partagée, ou gardée dans un téléphone, ne doit pas tomber sur
 * une page introuvable. Elle mène là où on commence vraiment.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ redirect }) => redirect('/ouverture', 301);
export const POST: APIRoute = ({ redirect }) => redirect('/ouverture', 303);
