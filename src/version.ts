export const extractSemanticVersion = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const match = /(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?/.exec(value);
  return match?.[0];
};

export const compareSemanticVersions = (left: string, right: string): number => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

export const isVersionAtLeast = (
  actual: string | undefined,
  minimum: string | undefined
): boolean => {
  if (!minimum) {
    return true;
  }

  const actualVersion = extractSemanticVersion(actual);
  const minimumVersion = extractSemanticVersion(minimum);
  if (!actualVersion || !minimumVersion) {
    return true;
  }

  return compareSemanticVersions(actualVersion, minimumVersion) >= 0;
};

const parseVersion = (version: string): [number, number, number] => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return [0, 0, 0];
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
};
