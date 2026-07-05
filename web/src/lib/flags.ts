/**
 * Country flags for team codes — FIFA/3-letter → ISO 3166-1 alpha-2, rendered
 * from flagcdn (real flag images, not monograms). Home nations map to GB
 * subdivisions. Unknown codes fall back to the monogram chip in <Flag>.
 */
const FIFA_TO_ISO: Record<string, string> = {
  FRA: "fr", BRA: "br", ARG: "ar", ENG: "gb-eng", ESP: "es", POR: "pt", NED: "nl", GER: "de",
  BEL: "be", CRO: "hr", MAR: "ma", NOR: "no", ITA: "it", USA: "us", MEX: "mx", CAN: "ca",
  JPN: "jp", KOR: "kr", AUS: "au", SEN: "sn", GHA: "gh", CMR: "cm", NGA: "ng", EGY: "eg",
  TUN: "tn", SUI: "ch", DEN: "dk", SWE: "se", POL: "pl", SRB: "rs", WAL: "gb-wls", SCO: "gb-sct",
  URU: "uy", COL: "co", ECU: "ec", PER: "pe", CHI: "cl", KSA: "sa", IRN: "ir", QAT: "qa",
  AUT: "at", TUR: "tr", UKR: "ua", GRE: "gr", CRC: "cr", PAR: "py", RSA: "za", ALG: "dz",
  CIV: "ci", SVN: "si", SVK: "sk", ROU: "ro", HUN: "hu", CZE: "cz", NZL: "nz", PAN: "pa",
  HON: "hn", JAM: "jm", NIR: "gb-nir", IRL: "ie", ISL: "is", FIN: "fi", RUS: "ru", COD: "cd",
};

export function isoForCode(code?: string | null): string | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (FIFA_TO_ISO[up]) return FIFA_TO_ISO[up];
  if (/^[A-Z]{2}$/.test(up)) return up.toLowerCase(); // already an ISO2 code
  return null;
}

/** flagcdn image URL for a team code, or null if we can't map it. */
export function flagUrl(code?: string | null, width: 20 | 40 | 80 | 160 = 80): string | null {
  const iso = isoForCode(code);
  return iso ? `https://flagcdn.com/w${width}/${iso}.png` : null;
}
