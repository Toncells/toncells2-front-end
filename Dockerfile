FROM node:18-alpine AS build
WORKDIR /app
# Use yarn + yarn.lock: the caret range "^2.0.0-beta.6" for @tonconnect/*
# makes `npm install` pull incompatible 2.4.x/3.4.x that white-screens the app.
# yarn.lock pins the working beta versions, so builds match local exactly.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/build .

# Adjust the path in index.html to use relative links
RUN sed -i 's|/new-landing/static|./static|g' index.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
