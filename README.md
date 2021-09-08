# strapi-provider-upload-aws-s3-enhanced
![Supported Strapi version](https://img.shields.io/badge/Strapi-3.5.4-green.svg) ![GitHub license](https://img.shields.io/github/license/garretua/strapi-provider-upload-aws-s3-enhanced.svg)

Enhanced AWS S3 provider for Strapi uploads: thumbnails, image compression, WebP format, custom domain.

## Instalation

```
yarn add strapi-provider-upload-aws-s3-enhanced-v5
```

## Configuration
Update your `config/plugins.js`:

    module.exports = ({ env }) => ({
      upload: {
        provider: 'aws-s3-enhanced-v5',
        providerOptions: {
          accessKeyId: env('AWS_ACCESS_KEY_ID'),
          secretAccessKey: env('AWS_ACCESS_SECRET'),
          region: env('AWS_REGION'),
          params: {
            Bucket: env('AWS_BUCKET'),
          },
          customDomain: env('CDN_DOMAIN'),
          endpoint: env('CUSTOM_S3_ENDPOINT'), // For third-party S3-compatible storages
          prefix: null,
          quality: 80,
          webp: true,
          webpConfig: {},
          generateDensity: true,
          accessLevel: env('ACCESS_LEVEL'), // Default set to: 'public-read'
          thumbnails: [
            {
              name: 'custom',
              options: {
                width: 1200,
                withoutEnlargement: true,
              },
            },
            {
              name: 'preview',
              options: {
                width: 500,
                height: 300,
                fit: 'cover',
              },
              outputOptions: {},
            },
          ],
        },
      },
    });


## License

MIT License
