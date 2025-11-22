const pickValue = (req, key) => {
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, key) && req.body[key] !== '') {
    return req.body[key];
  }
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
    return req.query[key];
  }
  return undefined;
};

const buildPayload = (req, keys = []) =>
  keys.reduce((acc, key) => {
    const value = pickValue(req, key);
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

module.exports = {
  pickValue,
  buildPayload
};

