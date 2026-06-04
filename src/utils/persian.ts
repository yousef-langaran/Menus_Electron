export const normalizeNameFa = (value: string | null | undefined): string =>
  String(value || '')
    .trim()
    .replace(/[يىے]/g, 'ی')
    .replace(/[كڪګ]/g, 'ک')
    .replace(/[ةۀە]/g, 'ه')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ؤۄۊۋ]/g, 'و')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
