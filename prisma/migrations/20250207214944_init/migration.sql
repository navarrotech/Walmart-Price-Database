-- CreateTable
CREATE TABLE "ItemPriceReport" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(96),
    "skuid" VARCHAR(32) NOT NULL,
    "storeid" VARCHAR(8) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "reporter" VARCHAR(64) NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPriceReport_pkey" PRIMARY KEY ("id")
);
