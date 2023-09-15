'use strict';

const AWS = require('aws-sdk');
const sharp = require('sharp');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const STRAPI_IMAGE_PREFIXES = ['thumbnail_', 'large_', 'medium_', 'small_'];
const ACCESS_LEVEL = [
  "private",
  "public-read",
  "public-read-write",
  "authenticated-read",
  "bucket-owner-read",
  "bucket-owner-full-control",
];

const getDensityUrl = (url, density = '2x') =>
    url.replace(/(.+)(0.5x|1x|2x|3x|x4)((?:.+)?\.(?:jpg|png|jpeg|gif|webp))$/, `$1${density}$3`);

module.exports = {
    init(config) {
        let awsConfig = {
            region: config.region
        };

        if (config.accessKeyId && config.secretAccessKey) {
            awsConfig = {
                accessKeyId: config.accessKeyId.trim(),
                secretAccessKey: config.secretAccessKey.trim(),
                ...awsConfig,
            }
        }

        AWS.config.update(awsConfig);

        const S3 = new AWS.S3({
            endpoint: config.endpoint,
            apiVersion: '2006-03-01',
            params: config.params,
        });

        return {
            upload: async file => {

                if (
                    config.thumbnails &&
                    IMAGE_EXTENSIONS.includes(file.ext.toLowerCase()) &&
                    new RegExp(STRAPI_IMAGE_PREFIXES.join('|')).test(file.hash) === false
                ) {

                    const thumbs = await generateImages(file, config);

                    thumbs.forEach(images => {
                        images.forEach(image => {
                            S3Upload(S3)(image, `${image.name}_${file.hash}${image.ext}`, config);
                        });
                    });

                }

                if (
                    config.thumbnails &&
                    IMAGE_EXTENSIONS.includes(file.ext.toLowerCase()) &&
                    new RegExp(STRAPI_IMAGE_PREFIXES.join('|')).test(file.hash) === true
                ) {
                    const path = file.path ? `${file.path}/` : '';
                    const prefix = config.prefix ? config.prefix.trim() : '';
                    const objectKey = `${prefix}${path}${file.hash}${file.ext}`;
                    const s3url = `https://${config.params.Bucket}.s3.${config.region}.amazonaws.com`;

                    file.url = (config.customDomain && config.customDomain !== '-') ? `${config.customDomain}/${objectKey.replace(prefix, '')}` : `${s3url}/${objectKey}`;

                    return true;
                }

                return S3Upload(S3)(file, `${file.hash}${file.ext}`, config);
            },
            delete: async file => {

                if (
                    config.thumbnails &&
                    IMAGE_EXTENSIONS.includes(file.ext.toLowerCase()) &&
                    new RegExp(STRAPI_IMAGE_PREFIXES.join('|')).test(file.hash) === false
                ) {
                    config.thumbnails.forEach(item => {
                        S3Delete(S3)(file, `${item.name}_${file.hash}${file.ext}`, config);

                        if (config.generateDensity) {
                            S3Delete(S3)(file, getDensityUrl(`@2x/${(item.name)}_${file.hash}${file.ext}`), config);
                        }

                        if (config.webp) {
                            S3Delete(S3)(file, `${item.name}_${file.hash}.webp`, config);

                            if (config.generateDensity) {
                                S3Delete(S3)(file, getDensityUrl(`@2x/${item.name}_${file.hash}.webp`), config);
                            }
                        }
                    });
                }

                if (
                    config.thumbnails &&
                    IMAGE_EXTENSIONS.includes(file.ext.toLowerCase()) &&
                    new RegExp(STRAPI_IMAGE_PREFIXES.join('|')).test(file.hash) === true
                ) {
                    return true;
                }

                return S3Delete(S3)(file, `${file.hash}${file.ext}`, config);
            },
        };
    },
};

const getAccessLevel = (config) => {
    if (config.accessLevel) {
        if (ACCESS_LEVEL.includes(config.accessLevel)) {
            return config.accessLevel
        }
        throw Error(
            `The object access level: ${config.accessLevel} is not valid. Please choose from: private, public-read, public-read-write, authenticated-read, bucket-owner-read or bucket-owner-full-control`
        );

    }

    if (config.accessLevel === null) {
        return null;
    }

    // default access level
    return 'public-read'
}

const S3Upload = S3 => (file, key, config) => {
    return new Promise((resolve, reject) => {

        const path = file.path ? `${file.path}/` : '';
        const prefix = config.prefix ? config.prefix.trim() : '';
        const objectKey = `${prefix}${path}${key}`;
        const accessLevel = getAccessLevel(config)

        S3.upload({
                Key: objectKey,
                Body: file.buffer instanceof Buffer ? file.buffer : new Buffer(file.buffer, 'binary'),
                ContentType: file.mime,
                ...(accessLevel ? { ACL: accessLevel } : {}),
            },
            (err, data) => {
                if (err) {
                    return reject(err);
                }

                file.url = (config.customDomain && config.customDomain !== '-') ? `${config.customDomain}/${objectKey.replace(prefix, '')}` : data.Location;

                strapi.log.info(`Uploaded file: ${key}`);

                resolve();
            }
        );
    });
}

const S3Delete = S3 => (file, key, config) => {
    return new Promise((resolve, reject) => {
        const path = file.path ? `${file.path}/` : '';
        const prefix = config.prefix ? config.prefix.trim() : '';
        const objectKey = `${prefix}${path}${key}`;

        S3.deleteObject({
                Key: objectKey,
            },(err, data) => {
                if (err) {
                    strapi.log.error(err);
                    return reject(err);
                }

                strapi.log.info(`Deleted file: ${key}`);

                resolve();
            }
        );
    });
}

const sharpGenerate = (method, { buffer, name, options, quality, outputOptions, file }) => sharp(buffer).resize(options || {})
    [method]({ quality: parseInt(quality), ...(outputOptions || {}) }).toBuffer()
    .then(data => ({
        buffer: data,
        mime: file.mime,
        ext: file.ext,
        name,
    }));

const generateImages = async (file, config) => {
    const buffer = new Buffer(file.buffer, 'binary');

    const { thumbnails, webp, webpConfig, quality, generateDensity } = config;

    const imagesToCreate = thumbnails.map(async item => {
        const { name, options, outputOptions } = item;
        const images = [];

        const params = {
            buffer,
            options,
            outputOptions,
            file,
            quality,
            name,
        };
        const densityParams = {
            ...params,
            options: {
                ...options,
                ...(options.width ? { width: options.width * 2 } : {}),
                ...(options.height ? { height: options.height * 2 } : {}),
            },
            name: `@2x/${name}`,
        };

        switch (file.ext.toLowerCase()) {
            case '.png':
                images.push(await sharpGenerate('png', params));

                if (generateDensity) {
                    images.push(await sharpGenerate('png', densityParams));
                }
                break;
            case '.webp':
                images.push(await sharpGenerate('webp', params));

                if (generateDensity) {
                    images.push(await sharpGenerate('webp', densityParams));
                }
                break;
            case '.jpg':
            case '.jpeg':
                images.push(await sharpGenerate('jpeg', params));

                if (generateDensity) {
                    images.push(await sharpGenerate('jpeg', densityParams));
                }
                break;
        }

        if (webp && file.mime !== 'image/webp') {
            const webpParams = {
                ...params,
                outputOptions: webpConfig || {},
                file: {
                    mime: 'image/webp',
                    ext: '.webp',
                }
            };

            images.push(await sharpGenerate('webp', webpParams));

            if (generateDensity) {
                images.push(await sharpGenerate('webp', {
                    ...webpParams,
                    options: densityParams.options,
                    name: `@2x/${name}`,
                }));
            }
        }

        return images;
    });

    return Promise.all(imagesToCreate);
};
