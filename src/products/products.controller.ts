import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ProductCatalog } from './product.catalog.js';
import {
  parseProductDraft,
  parseProductId,
  parseProductPatch,
  parseSearchQuery,
  toProductJson,
  toSearchPageJson,
  type ParseResult,
} from './product.parse.js';
import type { ProductJson, SearchPageJson } from './product.contract.js';

function orBadRequest<T>(result: ParseResult<T>, message: string): T {
  if (result.ok) return result.value;
  throw new BadRequestException({
    statusCode: 400,
    message,
    issues: result.issues,
  });
}

@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: ProductCatalog) {}

  /** Nest matches in declaration order, so this must be registered before `:id`. */
  @Get('search')
  async search(@Query() raw: Record<string, unknown>): Promise<SearchPageJson> {
    const query = orBadRequest(parseSearchQuery(raw), 'Invalid query');
    return toSearchPageJson(await this.catalog.search(query));
  }

  @Get(':id')
  getOne(@Param('id') raw: string): ProductJson {
    const id = orBadRequest(parseProductId(raw), 'Invalid product id');
    const product = this.catalog.get(id);
    if (product === null) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Product not found',
      });
    }
    return toProductJson(product);
  }

  @Post('add')
  @HttpCode(201)
  async add(@Body() raw: unknown): Promise<ProductJson> {
    const draft = orBadRequest(parseProductDraft(raw), 'Invalid product');
    const product = await this.catalog.add(draft);
    return toProductJson(product);
  }

  @Put(':id')
  async update(
    @Param('id') rawId: string,
    @Body() raw: unknown,
  ): Promise<ProductJson> {
    const id = orBadRequest(parseProductId(rawId), 'Invalid product id');
    const patch = orBadRequest(parseProductPatch(raw), 'Invalid product');
    const product = await this.catalog.update(id, patch);
    if (product === null) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Product not found',
      });
    }
    return toProductJson(product);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') raw: string): Promise<void> {
    const id = orBadRequest(parseProductId(raw), 'Invalid product id');
    const removed = await this.catalog.remove(id);
    if (!removed) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Product not found',
      });
    }
  }
}
