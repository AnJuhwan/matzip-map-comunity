import { describe, expect, it } from "vitest";
import collection from "./matzip-map-community.postman_collection.json";
import environment from "./matzip-map-community.local.postman_environment.json";

describe("Postman collection", () => {
  it("contains runnable local requests for the Naver candidate APIs", () => {
    const requestNames = collection.item.map((item) => item.name);

    expect(collection.info.schema).toBe(
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    );
    expect(requestNames).toEqual([
      "Nearby candidates - JSON body",
      "Admin Naver places - JSON body",
    ]);
    expect(collection.item[0].request.method).toBe("POST");
    expect(collection.item[0].request.url.raw).toBe("{{baseUrl}}/api/nearby-place-candidates");
    expect(collection.item[1].request.header).toContainEqual({
      key: "x-matzip-admin-token",
      value: "{{adminToken}}",
    });
  });

  it("defines local Postman variables without committing secrets", () => {
    const values = Object.fromEntries(environment.values.map((item) => [item.key, item.value]));

    expect(environment.name).toBe("맛잘알 동네지도 Local");
    expect(values.baseUrl).toBe("http://localhost:3000");
    expect(values.adminToken).toBe("");
  });
});
