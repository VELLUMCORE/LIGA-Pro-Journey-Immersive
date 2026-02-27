/**
 * Returns the game's locale data.
 *
 * Localization is intentionally fixed to English.
 *
 * @module
 */
import Locale from '@liga/locale';
import { Prisma } from '@prisma/client';
import { Constants } from '@liga/shared';

/**
 * Exports this module.
 *
 * @function
 */
export default function (_profile: Prisma.ProfileGetPayload<unknown>) {
  // localization is intentionally fixed to English.
  return Locale.en as (typeof Locale)[Constants.LocaleIdentifier];
}
