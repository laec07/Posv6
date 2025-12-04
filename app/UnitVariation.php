<?php

namespace App;

use DB;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;


class UnitVariation extends Model
{
    protected $table = 'unit_variations';

    protected $fillable = [
        'business_id',
        'units_id',
        'products_id',
        'precio_unit',
    ];

    protected $casts = [
        'business_id' => 'integer',
        'units_id' => 'integer',
        'products_id' => 'integer',
        'precio_unit' => 'decimal:2',
    ];

    /**
     * Relación con Business
     */
    public function business()
    {
        return $this->belongsTo(Business::class, 'business_id', 'id');
    }

    /**
     * Relación con Unit
     */
    public function unit()
    {
        return $this->belongsTo(Unit::class, 'units_id', 'id');
    }

    /**
     * Relación con Product
     */
    public function product()
    {
        return $this->belongsTo(Product::class, 'products_id', 'id');
    }
}