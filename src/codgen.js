import chalk from "chalk";
import fs from "fs";
import { stringOne, functionSignature, endString } from "./codeStrings";
import {
  extractPathParams,
  toCamelCase,
  toTitleCase,
  notEmptyObj
} from "./utils";
import cp from "cp";

const isGoJson = json => {
  const api = json && json[0];
  return api && api.type && api.url && api.name && api.parameter.fields;
};
const isSwaggerJson = json => {
  return json && json.swagger;
};
export function generateSDK({
  jsonFile,
  jsFile,
  baseUrl = "",
  name = "yournameSDK",
  version,
  requiredHeaders = [],
  optionalHeaders = []
}) {
  let _jsonFile;
  let _name = toTitleCase(name);

  //reading through cli will only have absolute path
  if (jsonFile) {
    _jsonFile = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  }
  let _transformJson = a => a;
  let _transformOperations = {};

  if (jsFile) {
    const { transformOperations, transformJson } = require(jsFile);
    _transformJson = transformJson;
    _transformOperations = transformOperations;
  }
  let isSwaggerGenerated = isSwaggerJson(_jsonFile);
  let isGoGenerated = isGoJson(_jsonFile);
  const storeJsCodeInThisArr = [];

  storeJsCodeInThisArr.push(
    stringOne({
      version,
      sdkName: _name,
      baseUrl,
      transformOperations: _transformOperations ? true : false,
      requiredHeaders,
      optionalHeaders
    })
  );

  try {
    if (!isGoGenerated && !isSwaggerGenerated) {
      const formatedJson = transformJson(_jsonFile);
      formatedJson.forEach(
        ({ operationName, url, requestMethod, isFormData }) => {
          const operationFunction = functionSignature({
            hasPathParams: extractPathParams(url).length,
            operationName,
            transformResponse: _transformOperations[operationName],
            url,
            requestMethod: requestMethod.toUpperCase(),
            isFormData
          });
          storeJsCodeInThisArr.push(operationFunction);
        }
      );
    }
    if (isSwaggerGenerated) {
      const tags = _jsonFile.tags;
      const pathsData = _jsonFile.paths;
      Object.entries(pathsData).map(path => {
        const url = path[0];
        Object.entries(path[1]).forEach(method => {
          const requestMethod = method[0];
          const methodData = method[1];
          const apiGroup = (methodData.tags || ["common"])[0];
          const operationName = methodData.operationId;
          const consumes = methodData.consumes || [];
          const isFormData = consumes.includes("multipart/form-data");
          const operationFunction = functionSignature({
            hasPathParams: extractPathParams(url).length,
            operationName,
            transformResponse: _transformOperations[operationName],
            url,
            requestMethod: requestMethod.toUpperCase(),
            isFormData
          });
          storeJsCodeInThisArr.push(operationFunction);
        });
      });
    }
    if (isGoGenerated) {
      _jsonFile.map(api => {
        const url = api.url;
        const requestMethod = api.type;
        const apiGroup = api.group;
        const operationName = toCamelCase(api.name);
        const isFormData =
          api.parameter &&
          api.parameter.fields &&
          Object.entries(api.parameter.fields)
            .map(arr => arr[0])
            .includes("Request formdata");
        const operationFunction = functionSignature({
          hasPathParams: extractPathParams(url).length,
          operationName,
          transformResponse: _transformOperations[operationName],
          url,
          requestMethod: requestMethod.toUpperCase(),
          isFormData
        });
        storeJsCodeInThisArr.push(operationFunction);
      });
    }
  } catch (err) {
    console.log(err);
    if (!(isGoGenerated && isSwaggerGenerated)) {
      console.error(
        "%s The file doesn't seem to be generated by swagger or godocs, you can provide a js file with custom funtion to resolve given json.",
        chalk.red.bold("ERROR")
      );
      process.exit(1);
    } else {
      console.log(err);
      console.error("%s error in json", chalk.red.bold("ERROR"));
      process.exit(1);
    }
  }
  storeJsCodeInThisArr.push(endString);
  const dir = "sdk";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  if (jsFile) {
    cp(jsFile, "sdk/transformOperations.js", (err, res) => {
      if (err) throw err;
    });
  }

  fs.writeFile("sdk/" + name + ".js", storeJsCodeInThisArr.join(""), err => {
    if (err) throw err;
  });
}
